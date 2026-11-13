import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

class AppUtils {
  static String formatDate(String? isoString, {String format = 'dd MMM yyyy'}) {
    if (isoString == null || isoString.isEmpty) return '—';
    try {
      final dateTime = DateTime.parse(isoString).toLocal();
      return DateFormat(format).format(dateTime);
    } catch (_) {
      return isoString;
    }
  }

  static String formatDateTime(String? isoString) {
    return formatDate(isoString, format: 'dd MMM yyyy, hh:mm a');
  }

  static String cleanMobile(String input) {
    return input.replaceAll(RegExp(r'[\s\-\(\)\+]'), '');
  }

  static String? validateLeadName(String? value) {
    if (value == null || value.trim().isEmpty) {
      return 'Lead name is required';
    }
    final trimmed = value.trim();
    if (trimmed.length < 2 || trimmed.length > 150) {
      return 'Name must be between 2 and 150 characters';
    }
    return null;
  }

  static String? validateEmail(String? value) {
    if (value == null || value.trim().isEmpty) return null;
    final emailRegex = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');
    if (!emailRegex.hasMatch(value.trim())) {
      return 'Enter a valid email address';
    }
    return null;
  }

  static String? validateMobile(String? value) {
    if (value == null || value.trim().isEmpty) return null;
    final digits = cleanMobile(value);
    if (digits.length < 7 || digits.length > 15) {
      return 'Mobile must have 7 to 15 digits';
    }
    return null;
  }

  static String? validateContactFields(String? email, String? mobile) {
    final hasEmail = email != null && email.trim().isNotEmpty;
    final hasMobile = mobile != null && mobile.trim().isNotEmpty;
    if (!hasEmail && !hasMobile) {
      return 'At least one of Email or Mobile is required';
    }
    return null;
  }

  static Future<void> callPhone(BuildContext context, String phone) async {
    final clean = phone.replaceAll(RegExp(r'\s+'), '');
    final uri = Uri.parse('tel:$clean');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    } else {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Cannot launch phone dialer for $phone')),
        );
      }
    }
  }

  static Future<void> sendEmail(BuildContext context, String email) async {
    final uri = Uri.parse('mailto:$email');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    } else {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Cannot launch email app for $email')),
        );
      }
    }
  }

  static Future<void> openWebsite(BuildContext context, String url) async {
    String formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = 'https://$formattedUrl';
    }
    final uri = Uri.parse(formattedUrl);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Cannot open website $url')),
        );
      }
    }
  }

  static void showErrorSnackBar(BuildContext context, dynamic error) {
    final message = error is Exception ? error.toString() : error.toString();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Colors.red.shade700,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  static void showSuccessSnackBar(BuildContext context, String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Colors.green.shade700,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }
}

