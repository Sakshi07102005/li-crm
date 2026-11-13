import 'package:flutter/foundation.dart';
import 'api_client.dart';

class UserModel {
  final String id;
  final String email;
  final String firstName;
  final String lastName;
  final String? phone;
  final String? avatarUrl;
  final String roleCode;
  final String roleName;
  final bool isActive;

  UserModel({
    required this.id,
    required this.email,
    required this.firstName,
    required this.lastName,
    this.phone,
    this.avatarUrl,
    required this.roleCode,
    required this.roleName,
    required this.isActive,
  });

  String get fullName => '$firstName $lastName'.trim();

  factory UserModel.fromJson(Map<String, dynamic> json) {
    final role = json['role'] is Map ? json['role'] as Map<String, dynamic> : {};
    return UserModel(
      id: json['id']?.toString() ?? '',
      email: json['email']?.toString() ?? '',
      firstName: json['firstName']?.toString() ?? '',
      lastName: json['lastName']?.toString() ?? '',
      phone: json['phone']?.toString(),
      avatarUrl: json['avatarUrl']?.toString(),
      roleCode: role['code']?.toString() ?? '',
      roleName: role['name']?.toString() ?? '',
      isActive: json['isActive'] == true,
    );
  }
}

class SessionProvider extends ChangeNotifier {
  final ApiClient _api = ApiClient();

  UserModel? _user;
  Set<String> _permissions = {};
  bool _isLoading = true;

  UserModel? get user => _user;
  Set<String> get permissions => _permissions;
  bool get isAuthenticated => _user != null;
  bool get isLoading => _isLoading;

  SessionProvider() {
    _api.onAuthFailure = () {
      _user = null;
      _permissions.clear();
      notifyListeners();
    };
  }

  bool can(String permission) {
    return _permissions.contains(permission);
  }

  Future<void> initializeAuth() async {
    _isLoading = true;
    notifyListeners();

    try {
      final refresh = await _api.getRefreshToken();
      if (refresh == null || refresh.isEmpty) {
        _isLoading = false;
        notifyListeners();
        return;
      }

      final refreshRes = await _api.post('/auth/refresh', data: {'refreshToken': refresh});
      if (refreshRes is Map) {
        final access = refreshRes['accessToken']?.toString();
        final newRefresh = refreshRes['refreshToken']?.toString();
        if (access != null) {
          _api.setAccessToken(access);
          if (newRefresh != null && newRefresh.isNotEmpty) {
            await _api.saveRefreshToken(newRefresh);
          }
          await _loadProfileAndPermissions();
        }
      }
    } catch (_) {
      await _api.clearTokens();
      _user = null;
      _permissions.clear();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> login(String email, String password) async {
    final res = await _api.post('/auth/login', data: {
      'email': email,
      'password': password,
    });

    if (res is Map) {
      final tokens = res['tokens'] is Map ? res['tokens'] as Map<String, dynamic> : res;
      final access = tokens['accessToken']?.toString();
      final refresh = tokens['refreshToken']?.toString();

      if (access != null && refresh != null) {
        _api.setAccessToken(access);
        await _api.saveRefreshToken(refresh);
      }

      if (res['user'] is Map) {
        _user = UserModel.fromJson(res['user'] as Map<String, dynamic>);
      }

      await _loadProfileAndPermissions();
      notifyListeners();
    }
  }

  Future<void> _loadProfileAndPermissions() async {
    try {
      final meRes = await _api.get('/auth/me');
      if (meRes is Map) {
        _user = UserModel.fromJson(meRes as Map<String, dynamic>);
        if (meRes['permissions'] is List) {
          _permissions = (meRes['permissions'] as List).map((e) => e.toString()).toSet();
        }
      }

      final rbacRes = await _api.get('/rbac/permissions');
      if (rbacRes is Map && rbacRes['permissions'] is List) {
        _permissions.addAll((rbacRes['permissions'] as List).map((e) => e.toString()));
      }
    } catch (_) {}
  }

  Future<void> updateProfile({
    required String firstName,
    required String lastName,
    String? phone,
  }) async {
    final res = await _api.put('/auth/me', data: {
      'firstName': firstName,
      'lastName': lastName,
      if (phone != null) 'phone': phone,
    });

    if (res is Map) {
      _user = UserModel.fromJson(res as Map<String, dynamic>);
      notifyListeners();
    }
  }

  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    await _api.post('/auth/change-password', data: {
      'currentPassword': currentPassword,
      'newPassword': newPassword,
    });
  }

  Future<void> logout() async {
    final refresh = await _api.getRefreshToken();
    if (refresh != null && refresh.isNotEmpty) {
      try {
        await _api.post('/auth/logout', data: {'refreshToken': refresh});
      } catch (_) {}
    }
    await _api.clearTokens();
    _user = null;
    _permissions.clear();
    notifyListeners();
  }
}

