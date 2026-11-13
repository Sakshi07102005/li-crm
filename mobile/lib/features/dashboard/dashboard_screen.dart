import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../core/constants.dart';
import '../../core/utils.dart';
import '../leads/lead_detail_screen.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  final ApiClient _api = ApiClient();

  bool _isLoading = true;
  String? _errorMessage;
  Map<String, dynamic>? _dashboardData;
  List<dynamic> _followups = [];

  @override
  void initState() {
    super.initState();
    _fetchDashboard();
  }

  Future<void> _fetchDashboard() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final res = await _api.get('/reports/dashboard');
      List<dynamic> fList = [];
      try {
        final fRes = await _api.get('/followups', queryParameters: {'limit': 5, 'status': 'pending'});
        if (fRes is Map && fRes['followups'] is List) {
          fList = fRes['followups'] as List<dynamic>;
        }
      } catch (_) {}

      if (mounted) {
        setState(() {
          _dashboardData = res is Map ? res as Map<String, dynamic> : null;
          _followups = fList;
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
          _errorMessage = 'Failed to load dashboard metrics';
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Dashboard',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 20),
        ),
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
              const SizedBox(height: 16),
              Text(
                _errorMessage!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.textPrimary, fontSize: 15),
              ),
              const SizedBox(height: 20),
              ElevatedButton.icon(
                onPressed: _fetchDashboard,
                icon: const Icon(Icons.refresh, size: 18),
                label: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }

    final summary = _dashboardData?['summary'] is Map
        ? _dashboardData!['summary'] as Map<String, dynamic>
        : <String, dynamic>{};

    final totalLeads = (summary['totalLeads'] as num?)?.toInt() ?? 0;
    final newLeads = (summary['newLeads'] as num?)?.toInt() ?? 0;
    final convertedLeads = (summary['convertedLeads'] as num?)?.toInt() ?? 0;

    final pendingF = _dashboardData?['pendingFollowUps'] is Map
        ? _dashboardData!['pendingFollowUps'] as Map<String, dynamic>
        : <String, dynamic>{};
    final followupsDue = (pendingF['total'] as num?)?.toInt() ?? 0;

    final conversionPct = totalLeads > 0 ? ((convertedLeads / totalLeads) * 100).toStringAsFixed(1) : '0';

    final leadsByStatus = (_dashboardData?['leadsByStatus'] as List<dynamic>?) ?? [];
    final leadsByProduct = (_dashboardData?['leadsByProduct'] as List<dynamic>?) ?? [];

    return RefreshIndicator(
      onRefresh: _fetchDashboard,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Stat Cards Grid
          Row(
            children: [
              Expanded(child: _statCard('Total Leads', totalLeads.toString(), Icons.people_outline, AppColors.info)),
              const SizedBox(width: 12),
              Expanded(child: _statCard('New Leads', newLeads.toString(), Icons.fiber_new_outlined, AppColors.primary)),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: _statCard('Follow-ups Due', followupsDue.toString(), Icons.alarm, AppColors.warning)),
              const SizedBox(width: 12),
              Expanded(child: _statCard('Converted', convertedLeads.toString(), Icons.check_circle_outline, AppColors.success)),
            ],
          ),
          const SizedBox(height: 12),
          _statCard('Conversion Rate', '$conversionPct%', Icons.trending_up, AppColors.primaryDark),

          // Status Distribution Chart
          if (leadsByStatus.isNotEmpty) ...[
            const SizedBox(height: 24),
            _buildStatusSection(leadsByStatus),
          ],

          // Product Distribution
          if (leadsByProduct.isNotEmpty) ...[
            const SizedBox(height: 24),
            _buildProductSection(leadsByProduct),
          ],

          // Upcoming Follow-ups
          const SizedBox(height: 24),
          _buildUpcomingFollowups(),
        ],
      ),
    );
  }

  Widget _statCard(String label, String value, IconData icon, Color color) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    fontSize: 13,
                    color: AppColors.textSecondary,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                Icon(icon, size: 20, color: color),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              value,
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusSection(List<dynamic> statusList) {
    final colors = [
      AppColors.primary,
      AppColors.info,
      AppColors.warning,
      AppColors.success,
      AppColors.danger,
      Colors.purple,
      Colors.teal,
      Colors.indigo,
    ];

    final sections = <PieChartSectionData>[];
    for (int i = 0; i < statusList.length; i++) {
      final st = statusList[i];
      final count = ((st['count'] as num?) ?? 0) * 1.0;
      if (count > 0) {
        sections.add(
          PieChartSectionData(
            value: count,
            title: count.toInt().toString(),
            color: colors[i % colors.length],
            radius: 40,
            titleStyle: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.bold,
              color: Colors.white,
            ),
          ),
        );
      }
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Leads by Status',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
            if (sections.isNotEmpty)
              SizedBox(
                height: 160,
                child: PieChart(
                  PieChartData(
                    sections: sections,
                    centerSpaceRadius: 36,
                    sectionsSpace: 2,
                  ),
                ),
              ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 12,
              runSpacing: 6,
              children: List.generate(statusList.length, (i) {
                final st = statusList[i];
                final count = (st['count'] as num?)?.toInt() ?? 0;
                return Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 10,
                      height: 10,
                      decoration: BoxDecoration(
                        color: colors[i % colors.length],
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 4),
                    Text(
                      '${st['statusName']}: $count',
                      style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                    ),
                  ],
                );
              }),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildProductSection(List<dynamic> products) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Product Distribution',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            ...products.map((p) {
              final count = (p['count'] as num?)?.toInt() ?? 0;
              final name = p['productName']?.toString() ?? 'Unknown';
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(name, style: const TextStyle(fontSize: 14)),
                    Text(
                      count.toString(),
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                    ),
                  ],
                ),
              );
            }),
          ],
        ),
      ),
    );
  }

  Widget _buildUpcomingFollowups() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Upcoming Follow-ups',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
              ],
            ),
            const SizedBox(height: 12),
            if (_followups.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Center(
                  child: Text(
                    'No pending follow-ups scheduled',
                    style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
                  ),
                ),
              )
            else
              ..._followups.map((f) {
                final lead = f['lead'] is Map ? f['lead'] as Map<String, dynamic> : null;
                final leadId = lead?['id']?.toString();
                final leadName = lead?['leadName']?.toString() ?? 'Lead';
                final isOverdue = f['isOverdue'] == true;

                return InkWell(
                  onTap: leadId != null
                      ? () {
                          Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => LeadDetailScreen(leadId: leadId),
                            ),
                          );
                        }
                      : null,
                  borderRadius: BorderRadius.circular(8),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: isOverdue ? AppColors.dangerBg : AppColors.primaryLight,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Icon(
                            Icons.calendar_today,
                            size: 16,
                            color: isOverdue ? AppColors.danger : AppColors.primary,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                leadName,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 14,
                                ),
                              ),
                              Text(
                                '${f['type']?.toString().toUpperCase()} • ${AppUtils.formatDateTime(f['scheduledAt']?.toString())}',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: isOverdue ? AppColors.danger : AppColors.textSecondary,
                                  fontWeight: isOverdue ? FontWeight.w600 : FontWeight.normal,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const Icon(Icons.chevron_right, size: 18, color: AppColors.textMuted),
                      ],
                    ),
                  ),
                );
              }),
          ],
        ),
      ),
    );
  }
}
