import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api_client.dart';
import '../../core/constants.dart';
import '../../core/session.dart';
import '../../core/utils.dart';
import '../activity/activity_screen.dart';
import '../activity/add_activity_sheet.dart';
import '../followups/schedule_followup_sheet.dart';
import 'update_status_sheet.dart';

class LeadDetailScreen extends StatefulWidget {
  final String leadId;

  const LeadDetailScreen({super.key, required this.leadId});

  @override
  State<LeadDetailScreen> createState() => _LeadDetailScreenState();
}

class _LeadDetailScreenState extends State<LeadDetailScreen> {
  final ApiClient _api = ApiClient();

  bool _isLoading = true;
  String? _errorMessage;
  Map<String, dynamic>? _lead;
  List<dynamic> _followups = [];
  List<dynamic> _activities = [];

  @override
  void initState() {
    super.initState();
    _fetchDetails();
  }

  Future<void> _fetchDetails() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final res = await _api.get('/leads/${widget.leadId}');
      final leadData = res is Map ? (res['lead'] is Map ? res['lead'] as Map<String, dynamic> : res as Map<String, dynamic>) : null;

      List<dynamic> fList = [];
      try {
        final fRes = await _api.get('/followups', queryParameters: {'leadId': widget.leadId, 'limit': 10});
        if (fRes is Map && fRes['followups'] is List) {
          fList = fRes['followups'] as List<dynamic>;
        }
      } catch (_) {}

      List<dynamic> aList = [];
      try {
        final aRes = await _api.get('/leads/${widget.leadId}/activities', queryParameters: {'limit': 5});
        if (aRes is Map && aRes['activities'] is List) {
          aList = aRes['activities'] as List<dynamic>;
        }
      } catch (_) {}

      if (mounted) {
        setState(() {
          _lead = leadData;
          _followups = fList;
          _activities = aList;
          _isLoading = false;
        });
      }
    } on ApiError catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = e.message;
          _isLoading = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _errorMessage = 'Failed to load lead details';
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _updateFollowupStatus(String followupId, String newStatus) async {
    final outcomeController = TextEditingController();
    final shouldProceed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Mark as ${newStatus == 'completed' ? 'Completed' : 'Missed'}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: outcomeController,
              decoration: const InputDecoration(
                hintText: 'Enter outcome / notes (optional)',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Confirm'),
          ),
        ],
      ),
    );

    if (shouldProceed != true) return;

    try {
      await _api.patch('/followups/$followupId/status', data: {
        'status': newStatus,
        if (outcomeController.text.trim().isNotEmpty)
          'outcome': outcomeController.text.trim(),
      });
      if (mounted) {
        AppUtils.showSuccessSnackBar(context, 'Follow-up updated');
        _fetchDetails();
      }
    } on ApiError catch (e) {
      if (mounted) AppUtils.showErrorSnackBar(context, e.message);
    } catch (_) {
      if (mounted) AppUtils.showErrorSnackBar(context, 'Failed to update follow-up');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return Scaffold(
        appBar: AppBar(),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    if (_errorMessage != null || _lead == null) {
      return Scaffold(
        appBar: AppBar(),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.error_outline, size: 48, color: AppColors.danger),
                const SizedBox(height: 12),
                Text(_errorMessage ?? 'Lead not found', textAlign: TextAlign.center),
                const SizedBox(height: 16),
                ElevatedButton.icon(
                  onPressed: _fetchDetails,
                  icon: const Icon(Icons.refresh, size: 18),
                  label: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final lead = _lead!;
    final session = Provider.of<SessionProvider>(context);

    final leadName = lead['leadName']?.toString() ?? 'Unnamed';
    final leadCode = lead['leadCode']?.toString() ?? '';
    final email = lead['email']?.toString();
    final mobile = lead['mobile']?.toString();
    final website = lead['website']?.toString();
    final company = lead['companyName']?.toString();
    final priority = lead['priority']?.toString().toUpperCase() ?? 'MEDIUM';

    final status = lead['status'] is Map ? lead['status'] as Map<String, dynamic> : null;
    final statusName = status?['name']?.toString() ?? 'New Lead';

    final product = lead['product'] is Map ? lead['product'] as Map<String, dynamic> : null;
    final productName = product?['name']?.toString() ?? '—';

    final source = lead['source'] is Map ? lead['source'] as Map<String, dynamic> : null;
    final sourceName = source?['name']?.toString() ?? '—';

    final assigned = lead['assignedTo'] is Map ? lead['assignedTo'] as Map<String, dynamic> : null;
    final assignedName = assigned?['name']?.toString() ?? 'Unassigned';

    final allowedStatuses = (lead['allowedNextStatuses'] as List<dynamic>?) ?? [];

    final canManageFollowups = session.can('followups.manage');
    final canUpdateLead = session.can('leads.update');
    final canCreateActivity = session.can('activities.create');

    return Scaffold(
      appBar: AppBar(
        title: Text(
          leadCode.isNotEmpty ? leadCode : leadName,
          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _fetchDetails,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _fetchDetails,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Header Card
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                leadName,
                                style: const TextStyle(
                                  fontSize: 20,
                                  fontWeight: FontWeight.bold,
                                  color: AppColors.textPrimary,
                                ),
                              ),
                              if (company != null && company.isNotEmpty) ...[
                                const SizedBox(height: 4),
                                Text(
                                  company,
                                  style: const TextStyle(fontSize: 14, color: AppColors.textSecondary),
                                ),
                              ],
                            ],
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppColors.primaryLight,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            statusName,
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                              color: AppColors.primaryDark,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    // Quick Action Buttons
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceAround,
                      children: [
                        _quickActionButton(
                          icon: Icons.phone,
                          label: 'Call',
                          color: AppColors.success,
                          onTap: mobile != null && mobile.isNotEmpty
                              ? () => AppUtils.callPhone(context, mobile)
                              : null,
                        ),
                        _quickActionButton(
                          icon: Icons.email,
                          label: 'Email',
                          color: AppColors.info,
                          onTap: email != null && email.isNotEmpty
                              ? () => AppUtils.sendEmail(context, email)
                              : null,
                        ),
                        _quickActionButton(
                          icon: Icons.language,
                          label: 'Website',
                          color: AppColors.primary,
                          onTap: website != null && website.isNotEmpty
                              ? () => AppUtils.openWebsite(context, website)
                              : null,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 14),

            // Action Buttons Bar
            Row(
              children: [
                if (canUpdateLead)
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () {
                        showModalBottomSheet(
                          context: context,
                          isScrollControlled: true,
                          shape: const RoundedRectangleBorder(
                            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
                          ),
                          builder: (_) => UpdateStatusSheet(
                            leadId: widget.leadId,
                            currentStatusName: statusName,
                            allowedNextStatuses: allowedStatuses,
                            onUpdated: _fetchDetails,
                          ),
                        );
                      },
                      icon: const Icon(Icons.swap_horiz, size: 16),
                      label: const Text('Status'),
                    ),
                  ),
                if (canUpdateLead && canManageFollowups) const SizedBox(width: 8),
                if (canManageFollowups)
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () {
                        showModalBottomSheet(
                          context: context,
                          isScrollControlled: true,
                          shape: const RoundedRectangleBorder(
                            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
                          ),
                          builder: (_) => ScheduleFollowupSheet(
                            leadId: widget.leadId,
                            onScheduled: _fetchDetails,
                          ),
                        );
                      },
                      icon: const Icon(Icons.alarm_add, size: 16),
                      label: const Text('Follow-up'),
                    ),
                  ),
                if (canCreateActivity) const SizedBox(width: 8),
                if (canCreateActivity)
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () {
                        showModalBottomSheet(
                          context: context,
                          isScrollControlled: true,
                          shape: const RoundedRectangleBorder(
                            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
                          ),
                          builder: (_) => AddActivitySheet(
                            leadId: widget.leadId,
                            onAdded: _fetchDetails,
                          ),
                        );
                      },
                      icon: const Icon(Icons.post_add, size: 16),
                      label: const Text('Activity'),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 16),

            // Lead Info Details Card
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Lead Information',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                    ),
                    const Divider(height: 24),
                    _infoRow('Email', email ?? '—'),
                    _infoRow('Phone', mobile ?? '—'),
                    _infoRow('Product', productName),
                    _infoRow('Source', sourceName),
                    _infoRow('Priority', priority),
                    _infoRow('Assigned To', assignedName),
                    _infoRow('Created', AppUtils.formatDate(lead['createdAt']?.toString())),
                    if (lead['remarks'] != null && lead['remarks'].toString().isNotEmpty)
                      _infoRow('Remarks', lead['remarks'].toString()),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Follow-ups Section
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'Follow-ups',
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                        ),
                        if (canManageFollowups)
                          TextButton.icon(
                            onPressed: () {
                              showModalBottomSheet(
                                context: context,
                                isScrollControlled: true,
                                shape: const RoundedRectangleBorder(
                                  borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
                                ),
                                builder: (_) => ScheduleFollowupSheet(
                                  leadId: widget.leadId,
                                  onScheduled: _fetchDetails,
                                ),
                              );
                            },
                            icon: const Icon(Icons.add, size: 16),
                            label: const Text('Schedule'),
                          ),
                      ],
                    ),
                    if (_followups.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 12),
                        child: Text(
                          'No follow-ups recorded.',
                          style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
                        ),
                      )
                    else
                      ..._followups.map((f) {
                        final fId = f['id']?.toString() ?? '';
                        final fStatus = f['status']?.toString() ?? 'pending';
                        final fType = f['type']?.toString().toUpperCase() ?? 'CALL';
                        final fDate = AppUtils.formatDateTime(f['scheduledAt']?.toString());
                        final isOverdue = f['isOverdue'] == true && fStatus == 'pending';

                        return Container(
                          margin: const EdgeInsets.only(top: 8),
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: AppColors.background,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: AppColors.border),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    '$fType • $fDate',
                                    style: TextStyle(
                                      fontWeight: FontWeight.bold,
                                      fontSize: 13,
                                      color: isOverdue ? AppColors.danger : AppColors.textPrimary,
                                    ),
                                  ),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: fStatus == 'completed'
                                          ? AppColors.successBg
                                          : (isOverdue ? AppColors.dangerBg : AppColors.infoBg),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Text(
                                      isOverdue ? 'OVERDUE' : fStatus.toUpperCase(),
                                      style: TextStyle(
                                        fontSize: 10,
                                        fontWeight: FontWeight.bold,
                                        color: fStatus == 'completed'
                                            ? AppColors.success
                                            : (isOverdue ? AppColors.danger : AppColors.info),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              if (f['notes'] != null && f['notes'].toString().isNotEmpty) ...[
                                const SizedBox(height: 6),
                                Text(
                                  f['notes'].toString(),
                                  style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                                ),
                              ],
                              if (fStatus == 'pending' && canManageFollowups) ...[
                                const SizedBox(height: 8),
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.end,
                                  children: [
                                    OutlinedButton(
                                      style: OutlinedButton.styleFrom(
                                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                        minimumSize: Size.zero,
                                      ),
                                      onPressed: () => _updateFollowupStatus(fId, 'missed'),
                                      child: const Text('Missed', style: TextStyle(fontSize: 11)),
                                    ),
                                    const SizedBox(width: 8),
                                    ElevatedButton(
                                      style: ElevatedButton.styleFrom(
                                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                                        minimumSize: Size.zero,
                                      ),
                                      onPressed: () => _updateFollowupStatus(fId, 'completed'),
                                      child: const Text('Done', style: TextStyle(fontSize: 11)),
                                    ),
                                  ],
                                ),
                              ],
                            ],
                          ),
                        );
                      }),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Recent Activity Section
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'Recent Activity',
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                        ),
                        TextButton(
                          onPressed: () {
                            Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => ActivityScreen(
                                  leadId: widget.leadId,
                                  leadName: leadName,
                                ),
                              ),
                            );
                          },
                          child: const Text('View all →'),
                        ),
                      ],
                    ),
                    if (_activities.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 12),
                        child: Text(
                          'No activity history yet.',
                          style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
                        ),
                      )
                    else
                      ..._activities.take(3).map((act) {
                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 6),
                          child: Row(
                            children: [
                              const Icon(Icons.circle, size: 8, color: AppColors.primary),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  act['subject']?.toString() ?? act['type']?.toString().toUpperCase() ?? '',
                                  style: const TextStyle(fontSize: 13),
                                ),
                              ),
                              Text(
                                AppUtils.formatDate(act['occurredAt']?.toString()),
                                style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
                              ),
                            ],
                          ),
                        );
                      }),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _quickActionButton({
    required IconData icon,
    required String label,
    required Color color,
    required VoidCallback? onTap,
  }) {
    final isEnabled = onTap != null;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Opacity(
        opacity: isEnabled ? 1.0 : 0.4,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Column(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: color.withAlpha(25),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, color: color, size: 22),
              ),
              const SizedBox(height: 6),
              Text(
                label,
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _infoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 100,
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

