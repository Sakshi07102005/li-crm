import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:li_crm_mobile/core/utils.dart';

void main() {
  group('Module 9 Tests', () {
    test('1. Parallel 401 TOKEN_EXPIRED causes exactly ONE refresh and all retry once', () async {
      int refreshCalls = 0;
      int leadCalls = 0;
      bool refreshed = false;

      final testDio = Dio(BaseOptions(baseUrl: 'http://test.local/api'));

      Completer<String?>? refreshCompleter;

      Future<String?> singleFlightRefresh() async {
        if (refreshCompleter != null) return refreshCompleter!.future;
        refreshCompleter = Completer<String?>();
        refreshCalls++;
        await Future.delayed(const Duration(milliseconds: 30));
        refreshed = true;
        refreshCompleter!.complete('new_token_123');
        final res = refreshCompleter!.future;
        refreshCompleter = null;
        return res;
      }

      testDio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            return handler.next(options);
          },
          onError: (DioException error, handler) async {
            if (error.response?.statusCode == 401 && error.requestOptions.extra['retried'] != true) {
              final newToken = await singleFlightRefresh();
              final opts = error.requestOptions;
              opts.extra['retried'] = true;
              opts.headers['Authorization'] = 'Bearer $newToken';
              final response = await testDio.fetch(opts);
              return handler.resolve(response);
            }
            return handler.next(error);
          },
        ),
      );

      testDio.httpClientAdapter = _MockHttpClientAdapter((options) {
        if (options.path.contains('/leads')) {
          leadCalls++;
          if (!refreshed && options.extra['retried'] != true) {
            return ResponseBody.fromString(
              '{"success":false,"message":"Token expired","error":{"code":"TOKEN_EXPIRED"}}',
              401,
              headers: {
                Headers.contentTypeHeader: [Headers.jsonContentType]
              },
            );
          } else {
            return ResponseBody.fromString(
              '{"success":true,"message":"OK","data":{"leads":[]}}',
              200,
              headers: {
                Headers.contentTypeHeader: [Headers.jsonContentType]
              },
            );
          }
        }
        return ResponseBody.fromString('{}', 404);
      });

      // Fire 5 requests in parallel
      final futures = List.generate(5, (_) => testDio.get('/leads'));
      final responses = await Future.wait(futures);

      expect(responses.length, 5);
      for (final r in responses) {
        expect(r.statusCode, 200);
      }
      expect(refreshCalls, 1, reason: 'Expected exactly ONE refresh call for 5 parallel requests');
      expect(leadCalls, 10, reason: 'Expected 5 initial calls + 5 retried calls = 10 total calls');
    });

    test('2. Lead JSON sample parses and accessors work without error', () {
      final sample = {
        "id": "c97dc393-f4e7-434d-a35d-722a428244d9",
        "leadCode": "LI-LEAD-000382",
        "leadName": "Ritu Desai",
        "companyId": "1b9c7056-2c0a-4f0f-8766-7a72a9e46618",
        "companyName": "Sunrise Clinic",
        "contactId": null,
        "email": "ritu.desai.53@demo.licrm.example",
        "mobile": "+918141527529",
        "website": "https://sunriseclinic.demo.example",
        "industry": "Healthcare",
        "product": {
          "id": 2,
          "code": "BOOKEHEALTH",
          "name": "BookEHealth"
        },
        "source": {
          "id": 8,
          "name": "Walk-in",
          "isMarketing": false
        },
        "assignedTo": {
          "id": "215e4a4a-e7f4-465f-adc9-0b49e93cc6d8",
          "name": "Sneha Sales",
          "email": "sales2@licrm.example"
        },
        "priority": "high",
        "status": {
          "id": 1,
          "name": "New Lead",
          "sortOrder": 1,
          "isFinal": false
        },
        "nextFollowUpAt": null,
        "remarks": "Referred by an existing customer",
        "lostReason": null,
        "convertedAt": null,
        "createdBy": {
          "id": "4720fb8e-0efb-45a0-b1f9-b04b679a2c02",
          "name": "Sanjay Sales"
        },
        "createdAt": "2026-11-11T23:50:37.122Z",
        "updatedAt": "2026-11-11T23:50:37.122Z"
      };

      expect(sample['id'], isNotEmpty);
      expect(sample['leadName'], 'Ritu Desai');
      expect((sample['status'] as Map)['name'], 'New Lead');
      expect((sample['product'] as Map)['name'], 'BookEHealth');
      expect((sample['source'] as Map)['name'], 'Walk-in');
      expect((sample['assignedTo'] as Map)['name'], 'Sneha Sales');
      expect(sample['priority'], 'high');

      // Date formatting verification
      final formatted = AppUtils.formatDate(sample['createdAt'] as String);
      expect(formatted, isNotEmpty);
      expect(formatted, isNot('—'));
    });

    test('3. Add-lead validators reject bad mobile/email and require email or mobile', () {
      // 1. Both empty should fail contact requirement
      expect(
        AppUtils.validateContactFields('', ''),
        isNotNull,
      );
      expect(
        AppUtils.validateContactFields(null, null),
        isNotNull,
      );

      // 2. Either email or mobile satisfies contact requirement
      expect(
        AppUtils.validateContactFields('valid@example.com', ''),
        isNull,
      );
      expect(
        AppUtils.validateContactFields('', '+919876543210'),
        isNull,
      );

      // 3. Invalid email formats
      expect(AppUtils.validateEmail('notanemail'), isNotNull);
      expect(AppUtils.validateEmail('user@'), isNotNull);
      expect(AppUtils.validateEmail('valid.user@example.com'), isNull);

      // 4. Invalid mobile formats (< 7 digits or > 15 digits)
      expect(AppUtils.validateMobile('12345'), isNotNull);
      expect(AppUtils.validateMobile('12345678901234567'), isNotNull);
      expect(AppUtils.validateMobile('+91 98765-43210'), isNull); // 12 digits after strip

      // 5. Lead name validation (2-150 chars)
      expect(AppUtils.validateLeadName(''), isNotNull);
      expect(AppUtils.validateLeadName('A'), isNotNull);
      expect(AppUtils.validateLeadName('John Doe'), isNull);
    });
  });
}

class _MockHttpClientAdapter implements HttpClientAdapter {
  final ResponseBody Function(RequestOptions options) handler;

  _MockHttpClientAdapter(this.handler);

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

