import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../core/constants.dart';
import '../../core/utils.dart';
import '../leads/lead_detail_screen.dart';
import 'create_task_sheet.dart';

class TasksScreen extends StatefulWidget {
  const TasksScreen({super.key});

  @override
  State<TasksScreen> createState() => _TasksScreenState();
}

class _TasksScreenState extends State<TasksScreen> {
  final ApiClient _api = ApiClient();
  final ScrollController _scrollController = ScrollController();

  List<dynamic> _tasks = [];
  bool _isLoading = true;
  bool _isLoadingMore = false;
  String? _errorMessage;

  int _currentPage = 1;
  int _totalPages = 1;
  String _selectedStatus = 'all'; // all, pending, in_progress, completed, cancelled

  final List<String> _filterTabs = ['all', 'pending', 'in_progress', 'completed'];

  @override
  void initState() {
    super.initState();
    _fetchTasks(page: 1, reset: true);
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
        _fetchTasks(page: _currentPage + 1, reset: false);
      }
    }
  }

  Future<void> _fetchTasks({required int page, required bool reset}) async {
    if (reset) {
      setState(() {
        _isLoading = true;
        _errorMessage = null;
      });
    } else {
      setState(() => _isLoadingMore = true);
    }

    try {
      final queryParams = <String, dynamic>{
        'mine': true,
        'page': page,
        'limit': 15,
      };

      if (_selectedStatus != 'all') {
        queryParams['status'] = _selectedStatus;
      }

      final res = await _api.get('/tasks', queryParameters: queryParams);

      if (mounted) {
        final list = (res['tasks'] as List<dynamic>?) ?? [];
        final meta = res['meta'] is Map ? res['meta'] as Map<String, dynamic> : {};

        setState(() {
          _currentPage = (meta['page'] as num?)?.toInt() ?? page;
          _totalPages = (meta['totalPages'] as num?)?.toInt() ?? 1;

          if (reset) {
            _tasks = list;
          } else {
            _tasks.addAll(list);
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
          _errorMessage = 'Failed to load tasks';
          _isLoading = false;
          _isLoadingMore = false;
        });
      }
    }
  }

  Future<void> _updateTaskStatus(String taskId, String newStatus) async {
    try {
      await _api.patch('/tasks/$taskId/status', data: {'status': newStatus});
      if (mounted) {
        AppUtils.showSuccessSnackBar(context, 'Task updated');
        _fetchTasks(page: 1, reset: true);
      }
    } on ApiError catch (e) {
      if (mounted) AppUtils.showErrorSnackBar(context, e.message);
    } catch (_) {
      if (mounted) AppUtils.showErrorSnackBar(context, 'Failed to update task');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'My Tasks',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 20),
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
            builder: (_) => CreateTaskSheet(
              onCreated: () => _fetchTasks(page: 1, reset: true),
            ),
          );
        },
        icon: const Icon(Icons.add),
        label: const Text('New Task'),
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
      ),
      body: Column(
        children: [
          // Filter Chips
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: _filterTabs.map((tab) {
                final isSelected = _selectedStatus == tab;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterChip(
                    label: Text(tab.replaceAll('_', ' ').toUpperCase()),
                    selected: isSelected,
                    onSelected: (_) {
                      setState(() => _selectedStatus = tab);
                      _fetchTasks(page: 1, reset: true);
                    },
                    selectedColor: AppColors.primaryLight,
                    checkmarkColor: AppColors.primary,
                    labelStyle: TextStyle(
                      fontSize: 12,
                      fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                      color: isSelected ? AppColors.primaryDark : AppColors.textPrimary,
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
          Expanded(child: _buildList()),
        ],
      ),
    );
  }

  Widget _buildList() {
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
                onPressed: () => _fetchTasks(page: 1, reset: true),
                icon: const Icon(Icons.refresh, size: 18),
                label: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }

    if (_tasks.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.check_circle_outline, size: 48, color: AppColors.textMuted),
            SizedBox(height: 12),
            Text(
              'No tasks in this category',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 16),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () => _fetchTasks(page: 1, reset: true),
      child: ListView.separated(
        controller: _scrollController,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        itemCount: _tasks.length + (_isLoadingMore ? 1 : 0),
        separatorBuilder: (_, _) => const SizedBox(height: 10),
        itemBuilder: (context, index) {
          if (index == _tasks.length) {
            return const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
            );
          }

          final task = _tasks[index];
          final taskId = task['id']?.toString() ?? '';
          final title = task['title']?.toString() ?? '';
          final desc = task['description']?.toString();
          final status = task['status']?.toString().toLowerCase() ?? 'pending';
          final priority = task['priority']?.toString().toUpperCase() ?? 'MEDIUM';
          final dueDate = task['dueDate']?.toString();
          final isOverdue = task['isOverdue'] == true && status != 'completed';

          final lead = task['lead'] is Map ? task['lead'] as Map<String, dynamic> : null;
          final leadId = lead?['id']?.toString();
          final leadName = lead?['leadName']?.toString();

          Color statusColor = AppColors.info;
          if (status == 'completed') statusColor = AppColors.success;
          if (isOverdue) statusColor = AppColors.danger;
          if (status == 'in_progress') statusColor = AppColors.warning;

          return Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Checkbox(
                        value: status == 'completed',
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
                        onChanged: (val) {
                          final target = val == true ? 'completed' : 'pending';
                          _updateTaskStatus(taskId, target);
                        },
                      ),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              title,
                              style: TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.bold,
                                decoration: status == 'completed'
                                    ? TextDecoration.lineThrough
                                    : null,
                                color: status == 'completed'
                                    ? AppColors.textMuted
                                    : AppColors.textPrimary,
                              ),
                            ),
                            if (desc != null && desc.isNotEmpty) ...[
                              const SizedBox(height: 4),
                              Text(
                                desc,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
                              ),
                            ],
                          ],
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: statusColor.withAlpha(25),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          isOverdue ? 'OVERDUE' : status.replaceAll('_', ' ').toUpperCase(),
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            color: statusColor,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const Divider(height: 16),
                  Row(
                    children: [
                      if (leadName != null && leadId != null) ...[
                        InkWell(
                          onTap: () {
                            Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => LeadDetailScreen(leadId: leadId),
                              ),
                            );
                          },
                          child: Text(
                            '👤 $leadName',
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.primary,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                        const Spacer(),
                      ] else ...[
                        const Spacer(),
                      ],
                      Text(
                        'Priority: $priority',
                        style: const TextStyle(fontSize: 11, color: AppColors.textSecondary),
                      ),
                      const SizedBox(width: 12),
                      Text(
                        'Due: ${AppUtils.formatDate(dueDate)}',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: isOverdue ? FontWeight.bold : FontWeight.normal,
                          color: isOverdue ? AppColors.danger : AppColors.textSecondary,
                        ),
                      ),
                    ],
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
