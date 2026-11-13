import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api_client.dart';
import '../../core/constants.dart';
import '../../core/session.dart';
import '../../core/utils.dart';
import '../auth/login_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _editFormKey = GlobalKey<FormState>();
  final _passwordFormKey = GlobalKey<FormState>();

  final _firstController = TextEditingController();
  final _lastController = TextEditingController();
  final _phoneController = TextEditingController();

  final _currentPasswordController = TextEditingController();
  final _newPasswordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();

  bool _isEditingProfile = false;
  bool _isSavingProfile = false;
  bool _isChangingPassword = false;

  @override
  void initState() {
    super.initState();
    final user = Provider.of<SessionProvider>(context, listen: false).user;
    if (user != null) {
      _firstController.text = user.firstName;
      _lastController.text = user.lastName;
      _phoneController.text = user.phone ?? '';
    }
  }

  @override
  void dispose() {
    _firstController.dispose();
    _lastController.dispose();
    _phoneController.dispose();
    _currentPasswordController.dispose();
    _newPasswordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  Future<void> _saveProfile() async {
    if (!_editFormKey.currentState!.validate()) return;

    setState(() => _isSavingProfile = true);

    try {
      final session = Provider.of<SessionProvider>(context, listen: false);
      await session.updateProfile(
        firstName: _firstController.text.trim(),
        lastName: _lastController.text.trim(),
        phone: _phoneController.text.trim().isNotEmpty ? _phoneController.text.trim() : null,
      );

      if (!mounted) return;
      setState(() => _isEditingProfile = false);
      AppUtils.showSuccessSnackBar(context, 'Profile updated successfully');
    } on ApiError catch (e) {
      if (!mounted) return;
      AppUtils.showErrorSnackBar(context, e.message);
    } catch (_) {
      if (!mounted) return;
      AppUtils.showErrorSnackBar(context, 'Failed to update profile');
    } finally {
      if (mounted) setState(() => _isSavingProfile = false);
    }
  }

  Future<void> _submitChangePassword() async {
    if (!_passwordFormKey.currentState!.validate()) return;

    if (_newPasswordController.text != _confirmPasswordController.text) {
      AppUtils.showErrorSnackBar(context, 'New passwords do not match');
      return;
    }

    setState(() => _isChangingPassword = true);

    try {
      final session = Provider.of<SessionProvider>(context, listen: false);
      await session.changePassword(
        currentPassword: _currentPasswordController.text,
        newPassword: _newPasswordController.text,
      );

      if (!mounted) return;
      Navigator.pop(context);
      _currentPasswordController.clear();
      _newPasswordController.clear();
      _confirmPasswordController.clear();
      AppUtils.showSuccessSnackBar(context, 'Password changed successfully');
    } on ApiError catch (e) {
      if (!mounted) return;
      AppUtils.showErrorSnackBar(context, e.message);
    } catch (_) {
      if (!mounted) return;
      AppUtils.showErrorSnackBar(context, 'Failed to change password');
    } finally {
      if (mounted) setState(() => _isChangingPassword = false);
    }
  }

  void _openChangePasswordDialog() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Change Password'),
        content: Form(
          key: _passwordFormKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextFormField(
                controller: _currentPasswordController,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Current Password'),
                validator: (v) => v == null || v.isEmpty ? 'Current password is required' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _newPasswordController,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'New Password'),
                validator: (v) {
                  if (v == null || v.isEmpty) return 'New password is required';
                  if (v.length < 8) return 'Password must be at least 8 characters';
                  return null;
                },
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _confirmPasswordController,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Confirm New Password'),
                validator: (v) => v == null || v.isEmpty ? 'Please confirm new password' : null,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: _isChangingPassword ? null : _submitChangePassword,
            child: _isChangingPassword
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Text('Update'),
          ),
        ],
      ),
    );
  }

  Future<void> _logout() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign Out'),
        content: const Text('Are you sure you want to log out of LI CRM?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.danger),
            child: const Text('Sign Out'),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      await Provider.of<SessionProvider>(context, listen: false).logout();
      if (!mounted) return;
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const LoginScreen()),
        (route) => false,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = Provider.of<SessionProvider>(context);
    final user = session.user;
    final permissions = session.permissions.toList()..sort();

    if (user == null) {
      return const Scaffold(body: Center(child: Text('No active user session')));
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('My Profile', style: TextStyle(fontWeight: FontWeight.bold)),
        actions: [
          if (!_isEditingProfile)
            IconButton(
              icon: const Icon(Icons.edit_outlined),
              onPressed: () {
                setState(() {
                  _firstController.text = user.firstName;
                  _lastController.text = user.lastName;
                  _phoneController.text = user.phone ?? '';
                  _isEditingProfile = true;
                });
              },
            ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // User Header Card
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 30,
                      backgroundColor: AppColors.primaryLight,
                      child: Text(
                        user.firstName.isNotEmpty ? user.firstName[0].toUpperCase() : 'U',
                        style: const TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                          color: AppColors.primary,
                        ),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            user.fullName,
                            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            user.email,
                            style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
                          ),
                          const SizedBox(height: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: AppColors.primaryLight,
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              user.roleName.toUpperCase(),
                              style: const TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                                color: AppColors.primaryDark,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Profile Edit / View Card
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: _isEditingProfile
                    ? Form(
                        key: _editFormKey,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Edit Profile',
                              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                            ),
                            const Divider(height: 20),
                            TextFormField(
                              controller: _firstController,
                              decoration: const InputDecoration(labelText: 'First Name *'),
                              validator: (v) => v == null || v.trim().isEmpty ? 'Required' : null,
                            ),
                            const SizedBox(height: 12),
                            TextFormField(
                              controller: _lastController,
                              decoration: const InputDecoration(labelText: 'Last Name *'),
                              validator: (v) => v == null || v.trim().isEmpty ? 'Required' : null,
                            ),
                            const SizedBox(height: 12),
                            TextFormField(
                              controller: _phoneController,
                              keyboardType: TextInputType.phone,
                              decoration: const InputDecoration(labelText: 'Phone'),
                            ),
                            const SizedBox(height: 16),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.end,
                              children: [
                                TextButton(
                                  onPressed: () => setState(() => _isEditingProfile = false),
                                  child: const Text('Cancel'),
                                ),
                                const SizedBox(width: 8),
                                ElevatedButton(
                                  onPressed: _isSavingProfile ? null : _saveProfile,
                                  child: _isSavingProfile
                                      ? const SizedBox(
                                          height: 18,
                                          width: 18,
                                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                        )
                                      : const Text('Save Changes'),
                                ),
                              ],
                            ),
                          ],
                        ),
                      )
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Personal Details',
                            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                          ),
                          const Divider(height: 20),
                          _detailRow('Email', user.email),
                          _detailRow('Phone', user.phone ?? 'Not set'),
                          _detailRow('Role', user.roleName),
                          _detailRow('Account Status', user.isActive ? 'Active' : 'Inactive'),
                        ],
                      ),
              ),
            ),
            const SizedBox(height: 16),

            // Security Card
            Card(
              child: ListTile(
                leading: const Icon(Icons.lock_reset, color: AppColors.primary),
                title: const Text('Change Password', style: TextStyle(fontWeight: FontWeight.w600)),
                subtitle: const Text('Update your login credentials', style: TextStyle(fontSize: 12)),
                trailing: const Icon(Icons.chevron_right, size: 20),
                onTap: _openChangePasswordDialog,
              ),
            ),
            const SizedBox(height: 16),

            // Permissions Summary Card
            Card(
              child: ExpansionTile(
                leading: const Icon(Icons.security, color: AppColors.primary),
                title: Text(
                  'Role Permissions (${permissions.length})',
                  style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                ),
                subtitle: Text('Role: ${user.roleName}', style: const TextStyle(fontSize: 12)),
                children: [
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: permissions.map((p) {
                        return Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: AppColors.neutralBg,
                            borderRadius: BorderRadius.circular(4),
                            border: Border.all(color: AppColors.border),
                          ),
                          child: Text(
                            p,
                            style: const TextStyle(fontSize: 11, fontFamily: 'monospace'),
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Sign out Button
            OutlinedButton.icon(
              onPressed: _logout,
              icon: const Icon(Icons.logout, color: AppColors.danger),
              label: const Text(
                'Sign Out',
                style: TextStyle(color: AppColors.danger, fontWeight: FontWeight.bold),
              ),
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: AppColors.danger),
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _detailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }
}

