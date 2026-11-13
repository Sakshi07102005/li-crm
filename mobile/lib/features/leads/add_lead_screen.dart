import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../core/constants.dart';
import '../../core/utils.dart';

class AddLeadScreen extends StatefulWidget {
  const AddLeadScreen({super.key});

  @override
  State<AddLeadScreen> createState() => _AddLeadScreenState();
}

class _AddLeadScreenState extends State<AddLeadScreen> {
  final ApiClient _api = ApiClient();
  final _formKey = GlobalKey<FormState>();

  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _mobileController = TextEditingController();
  final _companyController = TextEditingController();
  final _websiteController = TextEditingController();
  final _remarksController = TextEditingController();

  final _emailFocusNode = FocusNode();
  final _mobileFocusNode = FocusNode();

  List<dynamic> _products = [];
  List<dynamic> _sources = [];
  List<String> _priorities = [];
  List<String> _industries = [];

  int? _selectedProductId;
  int? _selectedSourceId;
  String _selectedPriority = 'medium';
  String? _selectedIndustry;

  bool _isLoadingLookups = true;
  bool _isSubmitting = false;
  String? _duplicateWarning;
  Map<String, String> _serverFieldErrors = {};

  @override
  void initState() {
    super.initState();
    _fetchLookups();
    _emailFocusNode.addListener(_onEmailBlur);
    _mobileFocusNode.addListener(_onMobileBlur);
  }

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _mobileController.dispose();
    _companyController.dispose();
    _websiteController.dispose();
    _remarksController.dispose();
    _emailFocusNode.removeListener(_onEmailBlur);
    _mobileFocusNode.removeListener(_onMobileBlur);
    _emailFocusNode.dispose();
    _mobileFocusNode.dispose();
    super.dispose();
  }

  Future<void> _fetchLookups() async {
    try {
      final res = await _api.get('/leads/lookups');
      if (res is Map && mounted) {
        setState(() {
          _products = (res['products'] as List<dynamic>?) ?? [];
          _sources = (res['sources'] as List<dynamic>?) ?? [];
          _priorities = ((res['priorities'] as List<dynamic>?) ?? []).map((e) => e.toString()).toList();
          _industries = ((res['industries'] as List<dynamic>?) ?? []).map((e) => e.toString()).toList();

          if (_products.isNotEmpty) _selectedProductId = (_products[0]['id'] as num).toInt();
          if (_sources.isNotEmpty) _selectedSourceId = (_sources[0]['id'] as num).toInt();
          if (_priorities.contains('medium')) _selectedPriority = 'medium';
          _isLoadingLookups = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _isLoadingLookups = false);
    }
  }

  void _onEmailBlur() {
    if (!_emailFocusNode.hasFocus && _emailController.text.trim().isNotEmpty) {
      _checkDuplicate();
    }
  }

  void _onMobileBlur() {
    if (!_mobileFocusNode.hasFocus && _mobileController.text.trim().isNotEmpty) {
      _checkDuplicate();
    }
  }

  Future<void> _checkDuplicate() async {
    final email = _emailController.text.trim();
    final mobile = AppUtils.cleanMobile(_mobileController.text.trim());

    if (email.isEmpty && mobile.isEmpty) return;

    try {
      final res = await _api.post('/leads/check-duplicate', data: {
        if (email.isNotEmpty) 'email': email,
        if (mobile.isNotEmpty) 'mobile': mobile,
      });

      if (res is Map && mounted) {
        final isDup = res['isDuplicate'] == true;
        setState(() {
          if (isDup) {
            final leadName = res['lead']?['leadName'] ?? 'a lead';
            _duplicateWarning = 'Warning: A matching lead ($leadName) already exists in the system.';
          } else {
            _duplicateWarning = null;
          }
        });
      }
    } catch (_) {}
  }

  Future<void> _submitForm({bool allowDuplicate = false}) async {
    setState(() {
      _serverFieldErrors.clear();
    });

    if (!_formKey.currentState!.validate()) return;

    final contactValidation = AppUtils.validateContactFields(
      _emailController.text,
      _mobileController.text,
    );
    if (contactValidation != null) {
      AppUtils.showErrorSnackBar(context, contactValidation);
      return;
    }

    setState(() => _isSubmitting = true);

    try {
      final body = <String, dynamic>{
        'leadName': _nameController.text.trim(),
        'productId': _selectedProductId,
        'sourceId': _selectedSourceId,
        'priority': _selectedPriority,
        'allowDuplicate': allowDuplicate,
      };

      if (_emailController.text.trim().isNotEmpty) {
        body['email'] = _emailController.text.trim();
      }
      if (_mobileController.text.trim().isNotEmpty) {
        body['mobile'] = _mobileController.text.trim();
      }
      if (_companyController.text.trim().isNotEmpty) {
        body['companyName'] = _companyController.text.trim();
      }
      if (_websiteController.text.trim().isNotEmpty) {
        body['website'] = _websiteController.text.trim();
      }
      if (_selectedIndustry != null && _selectedIndustry!.isNotEmpty) {
        body['industry'] = _selectedIndustry;
      }
      if (_remarksController.text.trim().isNotEmpty) {
        body['remarks'] = _remarksController.text.trim();
      }

      await _api.post('/leads', data: body);

      if (!mounted) return;
      AppUtils.showSuccessSnackBar(context, 'Lead created successfully');
      Navigator.of(context).pop(true);
    } on ApiError catch (e) {
      if (e.code == 'DUPLICATE_LEAD' && e.details is Map) {
        _showDuplicateDialog(e.details);
      } else if (e.code == 'VALIDATION_ERROR') {
        setState(() {
          _serverFieldErrors = e.fieldErrors;
        });
        AppUtils.showErrorSnackBar(context, e.message);
      } else {
        AppUtils.showErrorSnackBar(context, e.message);
      }
    } catch (e) {
      AppUtils.showErrorSnackBar(context, 'Failed to create lead');
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  void _showDuplicateDialog(Map<dynamic, dynamic> details) {
    final duplicates = (details['duplicates'] as List<dynamic>?) ?? [];

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Duplicate Lead Detected'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'A potential duplicate was found matching your input:',
              style: TextStyle(fontSize: 14),
            ),
            const SizedBox(height: 12),
            ...duplicates.map((d) {
              return Container(
                margin: const EdgeInsets.only(bottom: 6),
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppColors.neutralBg,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  '${d['leadName']} (${d['leadCode'] ?? ''}) - ${d['status'] ?? ''}',
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                ),
              );
            }),
            const SizedBox(height: 8),
            const Text(
              'Do you want to create this lead anyway?',
              style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(ctx);
              _submitForm(allowDuplicate: true);
            },
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.warning),
            child: const Text('Create Anyway'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoadingLookups) {
      return Scaffold(
        appBar: AppBar(title: const Text('New Lead')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('New Lead', style: TextStyle(fontWeight: FontWeight.bold)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_duplicateWarning != null)
                Container(
                  margin: const EdgeInsets.only(bottom: 16),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.warningBg,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppColors.warning),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.warning_amber_rounded, color: AppColors.warning, size: 20),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _duplicateWarning!,
                          style: const TextStyle(fontSize: 12, color: AppColors.textPrimary),
                        ),
                      ),
                    ],
                  ),
                ),
              // Lead Name
              const Text('Lead Name *', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
              const SizedBox(height: 6),
              TextFormField(
                controller: _nameController,
                textCapitalization: TextCapitalization.words,
                decoration: InputDecoration(
                  hintText: 'e.g. Rahul Sharma',
                  errorText: _serverFieldErrors['leadName'],
                ),
                validator: AppUtils.validateLeadName,
              ),
              const SizedBox(height: 14),
              // Email & Phone
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Email', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                        const SizedBox(height: 6),
                        TextFormField(
                          controller: _emailController,
                          focusNode: _emailFocusNode,
                          keyboardType: TextInputType.emailAddress,
                          decoration: InputDecoration(
                            hintText: 'user@example.com',
                            errorText: _serverFieldErrors['email'],
                          ),
                          validator: AppUtils.validateEmail,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Mobile', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                        const SizedBox(height: 6),
                        TextFormField(
                          controller: _mobileController,
                          focusNode: _mobileFocusNode,
                          keyboardType: TextInputType.phone,
                          decoration: InputDecoration(
                            hintText: '+91 9876543210',
                            errorText: _serverFieldErrors['mobile'],
                          ),
                          validator: AppUtils.validateMobile,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              // Product Picker
              const Text('Product *', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
              const SizedBox(height: 6),
              DropdownButtonFormField<int>(
                value: _selectedProductId,
                decoration: InputDecoration(errorText: _serverFieldErrors['productId']),
                items: _products.map((p) {
                  return DropdownMenuItem<int>(
                    value: (p['id'] as num).toInt(),
                    child: Text(p['name']?.toString() ?? ''),
                  );
                }).toList(),
                onChanged: (v) => setState(() => _selectedProductId = v),
                validator: (v) => v == null ? 'Please select a product' : null,
              ),
              const SizedBox(height: 14),
              // Source Picker
              const Text('Source *', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
              const SizedBox(height: 6),
              DropdownButtonFormField<int>(
                value: _selectedSourceId,
                decoration: InputDecoration(errorText: _serverFieldErrors['sourceId']),
                items: _sources.map((s) {
                  return DropdownMenuItem<int>(
                    value: (s['id'] as num).toInt(),
                    child: Text(s['name']?.toString() ?? ''),
                  );
                }).toList(),
                onChanged: (v) => setState(() => _selectedSourceId = v),
                validator: (v) => v == null ? 'Please select a source' : null,
              ),
              const SizedBox(height: 14),
              // Priority & Industry
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Priority *', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                        const SizedBox(height: 6),
                        DropdownButtonFormField<String>(
                          value: _selectedPriority,
                          items: _priorities.map((p) {
                            return DropdownMenuItem<String>(
                              value: p,
                              child: Text(p.toUpperCase()),
                            );
                          }).toList(),
                          onChanged: (v) {
                            if (v != null) setState(() => _selectedPriority = v);
                          },
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Industry', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                        const SizedBox(height: 6),
                        DropdownButtonFormField<String?>(
                          value: _selectedIndustry,
                          items: [
                            const DropdownMenuItem(value: null, child: Text('None')),
                            ..._industries.map((ind) => DropdownMenuItem<String?>(
                                  value: ind,
                                  child: Text(ind),
                                )),
                          ],
                          onChanged: (v) => setState(() => _selectedIndustry = v),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              // Company & Website
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Company Name', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                        const SizedBox(height: 6),
                        TextFormField(
                          controller: _companyController,
                          decoration: const InputDecoration(hintText: 'e.g. Acme Corp'),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Website', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                        const SizedBox(height: 6),
                        TextFormField(
                          controller: _websiteController,
                          keyboardType: TextInputType.url,
                          decoration: const InputDecoration(hintText: 'acme.example'),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              // Remarks
              const Text('Remarks', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
              const SizedBox(height: 6),
              TextFormField(
                controller: _remarksController,
                maxLines: 2,
                decoration: const InputDecoration(hintText: 'Initial notes or conversation context...'),
              ),
              const SizedBox(height: 28),
              ElevatedButton(
                onPressed: _isSubmitting ? null : () => _submitForm(allowDuplicate: false),
                child: _isSubmitting
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Text('Create Lead', style: TextStyle(fontSize: 16)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

