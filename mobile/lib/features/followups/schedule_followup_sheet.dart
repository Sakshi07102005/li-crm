import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/api_client.dart';
import '../../core/utils.dart';

class ScheduleFollowupSheet extends StatefulWidget {
  final String leadId;
  final VoidCallback onScheduled;

  const ScheduleFollowupSheet({
    super.key,
    required this.leadId,
    required this.onScheduled,
  });

  @override
  State<ScheduleFollowupSheet> createState() => _ScheduleFollowupSheetState();
}

class _ScheduleFollowupSheetState extends State<ScheduleFollowupSheet> {
  final ApiClient _api = ApiClient();
  final _notesController = TextEditingController();

  String _selectedType = 'call';
  DateTime _selectedDate = DateTime.now().add(const Duration(hours: 2));
  TimeOfDay _selectedTime = TimeOfDay.fromDateTime(DateTime.now().add(const Duration(hours: 2)));
  bool _isSubmitting = false;

  final List<String> _types = ['call', 'email', 'meeting', 'whatsapp', 'other'];

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate.isBefore(now) ? now : _selectedDate,
      firstDate: now,
      lastDate: now.add(const Duration(days: 365)),
    );
    if (picked != null) {
      setState(() {
        _selectedDate = DateTime(
          picked.year,
          picked.month,
          picked.day,
          _selectedTime.hour,
          _selectedTime.minute,
        );
      });
    }
  }

  Future<void> _pickTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: _selectedTime,
    );
    if (picked != null) {
      final combined = DateTime(
        _selectedDate.year,
        _selectedDate.month,
        _selectedDate.day,
        picked.hour,
        picked.minute,
      );
      if (combined.isBefore(DateTime.now())) {
        if (mounted) {
          AppUtils.showErrorSnackBar(context, 'Follow-up time cannot be in the past');
        }
        return;
      }
      setState(() {
        _selectedTime = picked;
        _selectedDate = combined;
      });
    }
  }

  Future<void> _submit() async {
    final scheduledAt = DateTime(
      _selectedDate.year,
      _selectedDate.month,
      _selectedDate.day,
      _selectedTime.hour,
      _selectedTime.minute,
    );

    if (scheduledAt.isBefore(DateTime.now())) {
      AppUtils.showErrorSnackBar(context, 'Follow-up date & time cannot be in the past');
      return;
    }

    setState(() => _isSubmitting = true);

    try {
      await _api.post('/followups', data: {
        'leadId': widget.leadId,
        'type': _selectedType,
        'scheduledAt': scheduledAt.toUtc().toIso8601String(),
        if (_notesController.text.trim().isNotEmpty)
          'notes': _notesController.text.trim(),
      });

      if (!mounted) return;
      Navigator.pop(context);
      widget.onScheduled();
      AppUtils.showSuccessSnackBar(context, 'Follow-up scheduled successfully');
    } on ApiError catch (e) {
      if (!mounted) return;
      AppUtils.showErrorSnackBar(context, e.message);
    } catch (_) {
      if (!mounted) return;
      AppUtils.showErrorSnackBar(context, 'Failed to schedule follow-up');
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
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Schedule Follow-up',
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
          const Text('Follow-up Type', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
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
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Date *', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                    const SizedBox(height: 6),
                    OutlinedButton.icon(
                      onPressed: _pickDate,
                      icon: const Icon(Icons.calendar_month, size: 18),
                      label: Text(DateFormat('dd MMM yyyy').format(_selectedDate)),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
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
                    const Text('Time *', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                    const SizedBox(height: 6),
                    OutlinedButton.icon(
                      onPressed: _pickTime,
                      icon: const Icon(Icons.access_time, size: 18),
                      label: Text(_selectedTime.format(context)),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                        alignment: Alignment.centerLeft,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          const Text('Notes (Optional)', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
          const SizedBox(height: 6),
          TextFormField(
            controller: _notesController,
            maxLines: 2,
            decoration: const InputDecoration(
              hintText: 'e.g. Discuss custom enterprise pricing package...',
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
                : const Text('Schedule Follow-up'),
          ),
        ],
      ),
    );
  }
}
