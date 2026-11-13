import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'constants.dart';

class ApiError implements Exception {
  final int status;
  final String code;
  final String message;
  final dynamic details;

  ApiError({
    required this.status,
    required this.code,
    required this.message,
    this.details,
  });

  Map<String, String> get fieldErrors {
    final result = <String, String>{};
    if (details is Map) {
      final fErrors = details['fieldErrors'];
      if (fErrors is Map) {
        for (final entry in fErrors.entries) {
          if (entry.value is List && (entry.value as List).isNotEmpty) {
            result[entry.key.toString()] = entry.value[0].toString();
          }
        }
      }
    }
    return result;
  }

  @override
  String toString() => message;
}

class ApiClient {
  static final ApiClient _instance = ApiClient._internal();
  factory ApiClient() => _instance;

  late final Dio dio;
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  String? _accessToken;
  Completer<String?>? _refreshCompleter;
  void Function()? onAuthFailure;

  ApiClient._internal() {
    dio = Dio(
      BaseOptions(
        baseUrl: apiBase,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 15),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      ),
    );

    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (_accessToken != null && _accessToken!.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $_accessToken';
          }
          return handler.next(options);
        },
        onError: (DioException error, handler) async {
          final res = error.response;
          final status = res?.statusCode ?? 0;
          final data = res?.data;

          String code = 'UNKNOWN_ERROR';
          String message = error.message ?? 'An error occurred';
          dynamic details;

          if (data is Map) {
            if (data['error'] is Map) {
              code = data['error']['code']?.toString() ?? code;
              details = data['error']['details'];
            }
            message = data['message']?.toString() ?? message;
          }

          // Check for token expired (401 with TOKEN_EXPIRED or 401 on protected route)
          final isExpired = status == 401 &&
              (code == 'TOKEN_EXPIRED' || code == 'UNAUTHORIZED' || code == 'INVALID_TOKEN');
          final isRetry = error.requestOptions.extra['isRetry'] == true;
          final isAuthPath = error.requestOptions.path.contains('/auth/');

          if (isExpired && !isRetry && !isAuthPath) {
            try {
              final newToken = await _refreshTokenSingleFlight();
              if (newToken != null) {
                final opts = error.requestOptions;
                opts.extra['isRetry'] = true;
                opts.headers['Authorization'] = 'Bearer $newToken';
                final clonedResponse = await dio.fetch(opts);
                return handler.resolve(clonedResponse);
              }
            } catch (_) {
              // Refresh failed, proceed to rejection
            }
            onAuthFailure?.call();
          }

          final apiError = ApiError(
            status: status,
            code: code,
            message: message,
            details: details,
          );

          return handler.reject(
            DioException(
              requestOptions: error.requestOptions,
              response: error.response,
              type: error.type,
              error: apiError,
              message: message,
            ),
          );
        },
      ),
    );
  }

  void setAccessToken(String? token) {
    _accessToken = token;
  }

  String? get accessToken => _accessToken;

  Future<void> saveRefreshToken(String token) async {
    await _storage.write(key: 'refreshToken', value: token);
  }

  Future<String?> getRefreshToken() async {
    return await _storage.read(key: 'refreshToken');
  }

  Future<void> clearTokens() async {
    _accessToken = null;
    await _storage.delete(key: 'refreshToken');
  }

  Future<String?> _refreshTokenSingleFlight() async {
    if (_refreshCompleter != null) {
      return _refreshCompleter!.future;
    }

    _refreshCompleter = Completer<String?>();

    try {
      final storedRefresh = await getRefreshToken();
      if (storedRefresh == null || storedRefresh.isEmpty) {
        throw Exception('No refresh token');
      }

      final refreshDio = Dio(BaseOptions(baseUrl: apiBase));
      final res = await refreshDio.post(
        '/auth/refresh',
        data: {'refreshToken': storedRefresh},
      );

      final data = res.data;
      if (data is Map && data['success'] == true) {
        final payload = data['data'];
        final newAccess = (payload is Map ? payload['accessToken'] : null)?.toString();
        final newRefresh = (payload is Map ? payload['refreshToken'] : null)?.toString();

        if (newAccess != null) {
          _accessToken = newAccess;
          if (newRefresh != null && newRefresh.isNotEmpty) {
            await saveRefreshToken(newRefresh);
          }
          _refreshCompleter!.complete(newAccess);
          return newAccess;
        }
      }
      throw Exception('Refresh token failed');
    } catch (e) {
      await clearTokens();
      _refreshCompleter!.complete(null);
      rethrow;
    } finally {
      _refreshCompleter = null;
    }
  }

  Future<dynamic> get(String path, {Map<String, dynamic>? queryParameters}) async {
    try {
      final res = await dio.get(path, queryParameters: queryParameters);
      return res.data is Map && res.data.containsKey('data') ? res.data['data'] : res.data;
    } on DioException catch (e) {
      if (e.error is ApiError) throw e.error as ApiError;
      throw ApiError(
        status: e.response?.statusCode ?? 0,
        code: 'NETWORK_ERROR',
        message: e.message ?? 'Network connection error',
      );
    }
  }

  Future<dynamic> post(String path, {dynamic data, Map<String, dynamic>? queryParameters}) async {
    try {
      final res = await dio.post(path, data: data, queryParameters: queryParameters);
      return res.data is Map && res.data.containsKey('data') ? res.data['data'] : res.data;
    } on DioException catch (e) {
      if (e.error is ApiError) throw e.error as ApiError;
      throw ApiError(
        status: e.response?.statusCode ?? 0,
        code: 'NETWORK_ERROR',
        message: e.message ?? 'Network connection error',
      );
    }
  }

  Future<dynamic> put(String path, {dynamic data}) async {
    try {
      final res = await dio.put(path, data: data);
      return res.data is Map && res.data.containsKey('data') ? res.data['data'] : res.data;
    } on DioException catch (e) {
      if (e.error is ApiError) throw e.error as ApiError;
      throw ApiError(
        status: e.response?.statusCode ?? 0,
        code: 'NETWORK_ERROR',
        message: e.message ?? 'Network connection error',
      );
    }
  }

  Future<dynamic> patch(String path, {dynamic data}) async {
    try {
      final res = await dio.patch(path, data: data);
      return res.data is Map && res.data.containsKey('data') ? res.data['data'] : res.data;
    } on DioException catch (e) {
      if (e.error is ApiError) throw e.error as ApiError;
      throw ApiError(
        status: e.response?.statusCode ?? 0,
        code: 'NETWORK_ERROR',
        message: e.message ?? 'Network connection error',
      );
    }
  }

  Future<dynamic> delete(String path) async {
    try {
      final res = await dio.delete(path);
      return res.data is Map && res.data.containsKey('data') ? res.data['data'] : res.data;
    } on DioException catch (e) {
      if (e.error is ApiError) throw e.error as ApiError;
      throw ApiError(
        status: e.response?.statusCode ?? 0,
        code: 'NETWORK_ERROR',
        message: e.message ?? 'Network connection error',
      );
    }
  }
}

