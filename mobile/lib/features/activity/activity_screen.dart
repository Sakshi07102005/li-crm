import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../core/constants.dart';
import '../../core/utils.dart';
import 'add_activity_sheet.dart';

class ActivityScreen extends StatefulWidget {
  final String leadId;
  final String leadName;

  const ActivityScreen({
    super.key,
    required this.leadId,
    required this.leadName,
  });

  @override
  State<ActivityScreen> createState() => _ActivityScreenState();
}

class _ActivityScreenState extends State<ActivityScreen> {
  final ApiClient _api = ApiClient();
  final ScrollController _scrollController = ScrollController();

  List<dynamic> _activities = [];
  bool _isLoading = true;
  bool _isLoadingMore = false;
  String? _errorMessage;

  int _currentPage = 1;
  int _totalPages = 1;

  @override
  void initState() {
    super.initState();
    _fetchActivities(page: 1, reset: true);
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >= _scrollController.position.maxScrollExtent - 200) {
      if (!_isLoadingMore && _currentPage < _totalPages) {
        _fetchActivities(page: _currentPage + 1, reset: false);
      }
    }
  }

  Future<void> _fetchActivities({required int page, required bool reset}) async {
    if (reset) {
      setState(() {
        _isLoading = true;
        _errorMessage = null;
      });
    } else {
      setState(() => _isLoadingMore = true);
    }

    try {
      final res = await _api.get(
        '/leads/${widget.leadId}/activities',
        queryParameters: {'page': page, 'limit': 15},
      );

      if (mounted) {
        final list = (res['activities'] as List<dynamic>?) ?? [];
        final meta = res['meta'] is Map ? res['meta'] as Map<String, dynamic> : {};

        setState(() {
          _currentPage = (meta['page'] as num?)?.toInt() ?? page;
          _totalPages = (meta['totalPages'] as num?)?.toInt() ?? 1;

          if (reset) {
            _activities = list;
          } else {
            _activities.addAll(list);
          }
          _isLoading = false;
          _isLoadingMore = false;
        });
      }
    } on ApiError catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = e.message;
          _isLoading = false;
          _isLoadingMore = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _errorMessage = 'Failed to load activity history';
          _isLoading = false;
          _isLoadingMore = false;
        });
      }
    }
  }

  IconData _iconForType(String type) {
    switch (type.toLowerCase()) {
      case 'call':
        return Icons.phone;
      case 'email':
        return Icons.email;
      case 'meeting':
        return Icons.groups;
      case 'status_change':
        return Icons.swap_horiz;
      default:
        return Icons.note_alt_outlined;
    }
  }

  Color _colorForType(String type) {
    switch (type.toLowerCase()) {
      case 'call':
        return AppColors.primary;
      case 'email':
        return AppColors.info;
      case 'meeting':
        return Colors.purple;
      case 'status_change':
        return AppColors.warning;
      default:
        return AppColors.neutral;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Activity: ${widget.leadName}',
          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {
          showModalBottomSheet(
            context: context,
            isScrollControlled: true,
            shape: const RoundedRectangleBorder(
              borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
            ),
            builder: (_) => AddActivitySheet(
              leadId: widget.leadId,
              onAdded: () => _fetchActivities(page: 1, reset: true),
            ),
          );
        },
        icon: const Icon(Icons.add),
        label: const Text('Add Activity'),
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_errorMessage != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 48, color: AppColors.danger),
              const SizedBox(height: 12),
              Text(_errorMessage!, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: () => _fetchActivities(page: 1, reset: true),
                icon: const Icon(Icons.refresh, size: 18),
                label: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }

    if (_activities.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.history, size: 48, color: AppColors.textMuted),
            SizedBox(height: 12),
            Text(
              'No activities recorded yet',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 15),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () => _fetchActivities(page: 1, reset: true),
      child: ListView.separated(
        controller: _scrollController,
        padding: const EdgeInsets.all(16),
        itemCount: _activities.length + (_isLoadingMore ? 1 : 0),
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (context, index) {
          if (index == _activities.length) {
            return const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
            );
          }

          final act = _activities[index];
          final type = act['type']?.toString() ?? 'note';
          final subject = act['subject']?.toString() ?? '';
          final notes = act['notes']?.toString();
          final outcome = act['outcome']?.toString();
          final date = act['occurredAt']?.toString() ?? act['createdAt']?.toString();

          final user = act['user'] is Map ? act['user'] as Map<String, dynamic> : null;
          final userName = user?['name']?.toString() ?? '';

          final icon = _iconForType(type);
          final color = _colorForType(type);

          return Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: color.withAlpha(30),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(icon, color: color, size: 18),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Expanded(
                              child: Text(
                                subject.isNotEmpty ? subject : type.toUpperCase(),
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 14,
                                ),
                              ),
                            ),
                            Text(
                              AppUtils.formatDate(date),
                              style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
                            ),
                          ],
                        ),
                        if (outcome != null && outcome.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: AppColors.neutralBg,
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              'Outcome: $outcome',
                              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w500),
                            ),
                          ),
                        ],
                        if (notes != null && notes.isNotEmpty) ...[
                          const SizedBox(height: 6),
                          Text(
                            notes,
                            style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
                          ),
                        ],
                        if (userName.isNotEmpty) ...[
                          const SizedBox(height: 6),
                          Text(
                            'By $userName',
                            style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
