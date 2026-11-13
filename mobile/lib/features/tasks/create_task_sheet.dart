import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/api_client.dart';
import '../../core/utils.dart';

class CreateTaskSheet extends StatefulWidget {
  final VoidCallback onCreated;

  const CreateTaskSheet({super.key, required this.onCreated});

  @override
  State<CreateTaskSheet> createState() => _CreateTaskSheetState();
}

class _CreateTaskSheetState extends State<CreateTaskSheet> {
  final ApiClient _api = ApiClient();
  final _formKey = GlobalKey<FormState>();

  final _titleController = TextEditingController();
  final _descController = TextEditingController();

  DateTime _dueDate = DateTime.now().add(const Duration(days: 1));
  String _selectedPriority = 'medium';
  bool _isSubmitting = false;

  final List<String> _priorities = ['low', 'medium', 'high'];

  @override
  void dispose() {
    _titleController.dispose();
    _descController.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _dueDate,
      firstDate: DateTime.now().subtract(const Duration(days: 1)),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked != null) {
      setState(() => _dueDate = picked);
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isSubmitting = true);

    try {
      await _api.post('/tasks', data: {
        'title': _titleController.text.trim(),
        if (_descController.text.trim().isNotEmpty)
          'description': _descController.text.trim(),
        'priority': _selectedPriority,
        'dueDate': _dueDate.toUtc().toIso8601String(),
      });

      if (!mounted) return;
      Navigator.pop(context);
      widget.onCreated();
      AppUtils.showSuccessSnackBar(context, 'Task created successfully');
    } on ApiError catch (e) {
      if (!mounted) return;
      AppUtils.showErrorSnackBar(context, e.message);
    } catch (_) {
      if (!mounted) return;
      AppUtils.showErrorSnackBar(context, 'Failed to create task');
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
                  'Create Task',
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
            const Text('Task Title *', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
            const SizedBox(height: 6),
            TextFormField(
              controller: _titleController,
              decoration: const InputDecoration(hintText: 'e.g. Follow up on proposal contract'),
              validator: (v) => v == null || v.trim().isEmpty ? 'Title is required' : null,
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Due Date *', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                      const SizedBox(height: 6),
                      OutlinedButton.icon(
                        onPressed: _pickDate,
                        icon: const Icon(Icons.calendar_today, size: 16),
                        label: Text(DateFormat('dd MMM yyyy').format(_dueDate)),
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
                          alignment: Alignment.centerLeft,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
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
              ],
            ),
            const SizedBox(height: 14),
            const Text('Description (Optional)', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
            const SizedBox(height: 6),
            TextFormField(
              controller: _descController,
              maxLines: 2,
              decoration: const InputDecoration(hintText: 'Task notes or checklist items...'),
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
                  : const Text('Save Task'),
            ),
          ],
        ),
      ),
    );
  }
}

