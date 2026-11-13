import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'core/constants.dart';
import 'core/session.dart';
import 'features/auth/splash_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const LiCrmApp());
}

class LiCrmApp extends StatelessWidget {
  const LiCrmApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider<SessionProvider>(
      create: (_) => SessionProvider(),
      child: MaterialApp(
        title: 'LI CRM',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.lightTheme,
        home: const SplashScreen(),
      ),
    );
  }
}
