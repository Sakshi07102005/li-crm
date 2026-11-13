import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../core/constants.dart';
import '../../core/utils.dart';

class UpdateStatusSheet extends StatefulWidget {
  final String leadId;
  final String currentStatusName;
  final List<dynamic> allowedNextStatuses;
  final VoidCallback onUpdated;

  const UpdateStatusSheet({
    super.key,
    required this.leadId,
    required this.currentStatusName,
    required this.allowedNextStatuses,
    required this.onUpdated,
  });

  @override
  State<UpdateStatusSheet> createState() => _UpdateStatusSheetState();
}

class _UpdateStatusSheetState extends State<UpdateStatusSheet> {
  final ApiClient _api = ApiClient();
  final _remarksController = TextEditingController();
  final _lostReasonController = TextEditingController();

  int? _selectedStatusId;
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    if (widget.allowedNextStatuses.isNotEmpty) {
      _selectedStatusId = (widget.allowedNextStatuses[0]['id'] as num).toInt();
    }
  }

  @override
  void dispose() {
    _remarksController.dispose();
    _lostReasonController.dispose();
    super.dispose();
  }

  bool get _isLostSelected {
    if (_selectedStatusId == null) return false;
    final match = widget.allowedNextStatuses.firstWhere(
      (s) => (s['id'] as num).toInt() == _selectedStatusId,
      orElse: () => null,
    );
    return match != null && match['name']?.toString().toLowerCase() == 'lost';
  }

  Future<void> _submit() async {
    if (_selectedStatusId == null) return;

    if (_isLostSelected && _lostReasonController.text.trim().isEmpty) {
      AppUtils.showErrorSnackBar(context, 'Lost reason is required when marking lead as Lost');
      return;
    }

    setState(() => _isSubmitting = true);

    try {
      await _api.patch('/leads/${widget.leadId}/status', data: {
        'statusId': _selectedStatusId,
        if (_remarksController.text.trim().isNotEmpty)
          'remarks': _remarksController.text.trim(),
        if (_isLostSelected)
          'lostReason': _lostReasonController.text.trim(),
      });

      if (!mounted) return;
      Navigator.pop(context);
      widget.onUpdated();
      AppUtils.showSuccessSnackBar(context, 'Lead status updated');
    } on ApiError catch (e) {
      if (!mounted) return;
      if (e.code == 'LEAD_NOT_ASSIGNED') {
        AppUtils.showErrorSnackBar(
          context,
          'Cannot update status: Lead must be assigned to an executive first.',
        );
      } else if (e.code == 'INVALID_STATUS_TRANSITION') {
        AppUtils.showErrorSnackBar(
          context,
          'Invalid transition: This status cannot be transitioned directly from current status.',
        );
      } else {
        AppUtils.showErrorSnackBar(context, e.message);
      }
    } catch (_) {
      if (!mounted) return;
      AppUtils.showErrorSnackBar(context, 'Failed to update status');
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.allowedNextStatuses.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.lock_outline, size: 40, color: AppColors.neutral),
            const SizedBox(height: 12),
            Text(
              'Status is Final (${widget.currentStatusName})',
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
            ),
            const SizedBox(height: 8),
            const Text(
              'No further status transitions are permitted for this lead.',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Close'),
            ),
          ],
        ),
      );
    }

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
                'Update Status',
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
          const Text('Select Next Status *', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
          const SizedBox(height: 6),
          DropdownButtonFormField<int>(
            value: _selectedStatusId,
            items: widget.allowedNextStatuses.map((s) {
              return DropdownMenuItem<int>(
                value: (s['id'] as num).toInt(),
                child: Text(s['name']?.toString() ?? ''),
              );
            }).toList(),
            onChanged: (v) => setState(() => _selectedStatusId = v),
          ),
          if (_isLostSelected) ...[
            const SizedBox(height: 14),
            const Text('Reason for Lost *', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
            const SizedBox(height: 6),
            TextFormField(
              controller: _lostReasonController,
              decoration: const InputDecoration(
                hintText: 'e.g. Budget constraints, opted for competitor...',
              ),
            ),
          ],
          const SizedBox(height: 14),
          const Text('Remarks (Optional)', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
          const SizedBox(height: 6),
          TextFormField(
            controller: _remarksController,
            maxLines: 2,
            decoration: const InputDecoration(
              hintText: 'Add conversation notes or reason for change...',
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
                : const Text('Update Status'),
          ),
        ],
      ),
    );
  }
}

