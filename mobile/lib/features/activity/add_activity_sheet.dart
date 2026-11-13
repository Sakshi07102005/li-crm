import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../core/utils.dart';

class AddActivitySheet extends StatefulWidget {
  final String leadId;
  final VoidCallback onAdded;

  const AddActivitySheet({
    super.key,
    required this.leadId,
    required this.onAdded,
  });

  @override
  State<AddActivitySheet> createState() => _AddActivitySheetState();
}

class _AddActivitySheetState extends State<AddActivitySheet> {
  final ApiClient _api = ApiClient();
  final _formKey = GlobalKey<FormState>();

  final _subjectController = TextEditingController();
  final _notesController = TextEditingController();
  final _outcomeController = TextEditingController();

  String _selectedType = 'call';
  bool _isSubmitting = false;

  final List<String> _types = ['call', 'email', 'meeting', 'note'];

  @override
  void dispose() {
    _subjectController.dispose();
    _notesController.dispose();
    _outcomeController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isSubmitting = true);

    try {
      await _api.post('/leads/${widget.leadId}/activities', data: {
        'type': _selectedType,
        'subject': _subjectController.text.trim(),
        if (_notesController.text.trim().isNotEmpty)
          'notes': _notesController.text.trim(),
        if (_outcomeController.text.trim().isNotEmpty)
          'outcome': _outcomeController.text.trim(),
      });

      if (!mounted) return;
      Navigator.pop(context);
      widget.onAdded();
      AppUtils.showSuccessSnackBar(context, 'Activity logged successfully');
    } on ApiError catch (e) {
      if (!mounted) return;
      AppUtils.showErrorSnackBar(context, e.message);
    } catch (_) {
      if (!mounted) return;
      AppUtils.showErrorSnackBar(context, 'Failed to log activity');
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.only(
        top: 20,
        left: 20,
        right: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Log Activity',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
            const Divider(),
            const SizedBox(height: 14),
            const Text('Activity Type', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
            const SizedBox(height: 6),
            DropdownButtonFormField<String>(
              value: _selectedType,
              items: _types.map((t) {
                return DropdownMenuItem<String>(
                  value: t,
                  child: Text(t.toUpperCase()),
                );
              }).toList(),
              onChanged: (v) {
                if (v != null) setState(() => _selectedType = v);
              },
            ),
            const SizedBox(height: 14),
            const Text('Subject *', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
            const SizedBox(height: 6),
            TextFormField(
              controller: _subjectController,
              decoration: const InputDecoration(
                hintText: 'e.g. Discussed proposal, Product demo',
              ),
              validator: (v) => v == null || v.trim().isEmpty ? 'Subject is required' : null,
            ),
            const SizedBox(height: 14),
            const Text('Outcome', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
            const SizedBox(height: 6),
            TextFormField(
              controller: _outcomeController,
              decoration: const InputDecoration(
                hintText: 'e.g. Client requested revisions, Agreed to demo',
              ),
            ),
            const SizedBox(height: 14),
            const Text('Notes', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
            const SizedBox(height: 6),
            TextFormField(
              controller: _notesController,
              maxLines: 2,
              decoration: const InputDecoration(
                hintText: 'Details of the conversation or meeting...',
              ),
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: _isSubmitting ? null : _submit,
              child: _isSubmitting
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Text('Save Activity'),
            ),
          ],
        ),
      ),
    );
  }
}

