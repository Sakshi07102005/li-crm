import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api_client.dart';
import '../../core/constants.dart';
import '../../core/session.dart';
import 'add_lead_screen.dart';
import 'lead_detail_screen.dart';

class LeadsScreen extends StatefulWidget {
  const LeadsScreen({super.key});

  @override
  State<LeadsScreen> createState() => _LeadsScreenState();
}

class _LeadsScreenState extends State<LeadsScreen> {
  final ApiClient _api = ApiClient();
  final ScrollController _scrollController = ScrollController();
  final TextEditingController _searchController = TextEditingController();

  Timer? _debounceTimer;
  List<dynamic> _leads = [];
  bool _isLoading = true;
  bool _isLoadingMore = false;
  String? _errorMessage;

  int _currentPage = 1;
  int _totalPages = 1;
  int _totalLeads = 0;

  // Filters
  int? _selectedStatusId;
  int? _selectedProductId;
  String? _selectedPriority;
  bool _filterOverdue = false;

  List<dynamic> _statuses = [];
  List<dynamic> _products = [];
  List<String> _priorities = [];

  @override
  void initState() {
    super.initState();
    _fetchLookups();
    _fetchLeads(page: 1, reset: true);
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _debounceTimer?.cancel();
    _scrollController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >= _scrollController.position.maxScrollExtent - 200) {
      if (!_isLoadingMore && _currentPage < _totalPages) {
        _fetchLeads(page: _currentPage + 1, reset: false);
      }
    }
  }

  Future<void> _fetchLookups() async {
    try {
      final res = await _api.get('/leads/lookups');
      if (res is Map && mounted) {
        setState(() {
          _statuses = (res['statuses'] as List<dynamic>?) ?? [];
          _products = (res['products'] as List<dynamic>?) ?? [];
          _priorities = ((res['priorities'] as List<dynamic>?) ?? []).map((e) => e.toString()).toList();
        });
      }
    } catch (_) {}
  }

  Future<void> _fetchLeads({required int page, required bool reset}) async {
    if (reset) {
      setState(() {
        _isLoading = true;
        _errorMessage = null;
      });
    } else {
      setState(() {
        _isLoadingMore = true;
      });
    }

    try {
      final queryParams = <String, dynamic>{
        'page': page,
        'limit': 15,
      };

      final term = _searchController.text.trim();
      if (term.isNotEmpty) queryParams['search'] = term;
      if (_selectedStatusId != null) queryParams['statusId'] = _selectedStatusId;
      if (_selectedProductId != null) queryParams['productId'] = _selectedProductId;
      if (_selectedPriority != null) queryParams['priority'] = _selectedPriority;
      if (_filterOverdue) queryParams['overdueFollowUp'] = true;

      final res = await _api.get('/leads', queryParameters: queryParams);

      if (mounted) {
        final list = (res['leads'] as List<dynamic>?) ?? [];
        final meta = res['meta'] is Map ? res['meta'] as Map<String, dynamic> : {};

        setState(() {
          _currentPage = (meta['page'] as num?)?.toInt() ?? page;
          _totalPages = (meta['totalPages'] as num?)?.toInt() ?? 1;
          _totalLeads = (meta['total'] as num?)?.toInt() ?? list.length;

          if (reset) {
            _leads = list;
          } else {
            _leads.addAll(list);
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
          _errorMessage = 'Failed to load leads';
          _isLoading = false;
          _isLoadingMore = false;
        });
      }
    }
  }

  void _onSearchChanged(String value) {
    _debounceTimer?.cancel();
    _debounceTimer = Timer(const Duration(milliseconds: 300), () {
      _fetchLeads(page: 1, reset: true);
    });
  }

  void _openFilterSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        int? tempStatus = _selectedStatusId;
        int? tempProduct = _selectedProductId;
        String? tempPriority = _selectedPriority;
        bool tempOverdue = _filterOverdue;

        return StatefulBuilder(
          builder: (sheetContext, setModalState) {
            return Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Filter Leads',
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                      ),
                      TextButton(
                        onPressed: () {
                          setModalState(() {
                            tempStatus = null;
                            tempProduct = null;
                            tempPriority = null;
                            tempOverdue = false;
                          });
                        },
                        child: const Text('Reset'),
                      ),
                    ],
                  ),
                  const Divider(),
                  const SizedBox(height: 12),
                  // Status
                  const Text('Status', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                  const SizedBox(height: 6),
                  DropdownButtonFormField<int?>(
                    value: tempStatus,
                    decoration: const InputDecoration(hintText: 'All Statuses'),
                    items: [
                      const DropdownMenuItem(value: null, child: Text('All Statuses')),
                      ..._statuses.map((s) => DropdownMenuItem<int?>(
                            value: (s['id'] as num).toInt(),
                            child: Text(s['name']?.toString() ?? ''),
                          )),
                    ],
                    onChanged: (v) => setModalState(() => tempStatus = v),
                  ),
                  const SizedBox(height: 14),
                  // Product
                  const Text('Product', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                  const SizedBox(height: 6),
                  DropdownButtonFormField<int?>(
                    value: tempProduct,
                    decoration: const InputDecoration(hintText: 'All Products'),
                    items: [
                      const DropdownMenuItem(value: null, child: Text('All Products')),
                      ..._products.map((p) => DropdownMenuItem<int?>(
                            value: (p['id'] as num).toInt(),
                            child: Text(p['name']?.toString() ?? ''),
                          )),
                    ],
                    onChanged: (v) => setModalState(() => tempProduct = v),
                  ),
                  const SizedBox(height: 14),
                  // Priority
                  const Text('Priority', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                  const SizedBox(height: 6),
                  DropdownButtonFormField<String?>(
                    value: tempPriority,
                    decoration: const InputDecoration(hintText: 'All Priorities'),
                    items: [
                      const DropdownMenuItem(value: null, child: Text('All Priorities')),
                      ..._priorities.map((p) => DropdownMenuItem<String?>(
                            value: p,
                            child: Text(p.toUpperCase()),
                          )),
                    ],
                    onChanged: (v) => setModalState(() => tempPriority = v),
                  ),
                  const SizedBox(height: 12),
                  SwitchListTile(
                    title: const Text('Overdue Follow-up Only', style: TextStyle(fontSize: 14)),
                    value: tempOverdue,
                    contentPadding: EdgeInsets.zero,
                    onChanged: (v) => setModalState(() => tempOverdue = v),
                  ),
                  const SizedBox(height: 20),
                  ElevatedButton(
                    onPressed: () {
                      Navigator.pop(ctx);
                      setState(() {
                        _selectedStatusId = tempStatus;
                        _selectedProductId = tempProduct;
                        _selectedPriority = tempPriority;
                        _filterOverdue = tempOverdue;
                      });
                      _fetchLeads(page: 1, reset: true);
                    },
                    child: const Text('Apply Filters'),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final canCreate = Provider.of<SessionProvider>(context).can('leads.create');

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'My Leads ($_totalLeads)',
          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 20),
        ),
        actions: [
          IconButton(
            icon: Badge(
              isLabelVisible: _selectedStatusId != null ||
                  _selectedProductId != null ||
                  _selectedPriority != null ||
                  _filterOverdue,
              child: const Icon(Icons.filter_list),
            ),
            onPressed: _openFilterSheet,
          ),
        ],
      ),
      floatingActionButton: canCreate
          ? FloatingActionButton.extended(
              onPressed: () async {
                final created = await Navigator.of(context).push<bool>(
                  MaterialPageRoute(builder: (_) => const AddLeadScreen()),
                );
                if (created == true) {
                  _fetchLeads(page: 1, reset: true);
                }
              },
              icon: const Icon(Icons.add),
              label: const Text('New Lead'),
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.white,
            )
          : null,
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: TextField(
              controller: _searchController,
              onChanged: _onSearchChanged,
              decoration: InputDecoration(
                hintText: 'Search by name, email, phone, company...',
                prefixIcon: const Icon(Icons.search, size: 20),
                suffixIcon: _searchController.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear, size: 18),
                        onPressed: () {
                          _searchController.clear();
                          _fetchLeads(page: 1, reset: true);
                        },
                      )
                    : null,
                isDense: true,
              ),
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
                onPressed: () => _fetchLeads(page: 1, reset: true),
                icon: const Icon(Icons.refresh, size: 18),
                label: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }

    if (_leads.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.inbox_outlined, size: 48, color: AppColors.textMuted),
            SizedBox(height: 12),
            Text(
              'No leads found',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 16),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () => _fetchLeads(page: 1, reset: true),
      child: ListView.separated(
        controller: _scrollController,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        itemCount: _leads.length + (_isLoadingMore ? 1 : 0),
        separatorBuilder: (_, _) => const SizedBox(height: 10),
        itemBuilder: (context, index) {
          if (index == _leads.length) {
            return const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
            );
          }

          final lead = _leads[index];
          final leadId = lead['id']?.toString() ?? '';
          final leadName = lead['leadName']?.toString() ?? 'Unnamed';
          final leadCode = lead['leadCode']?.toString();
          final company = lead['companyName']?.toString();

          final status = lead['status'] is Map ? lead['status'] as Map<String, dynamic> : null;
          final statusName = status?['name']?.toString() ?? 'New Lead';

          final priority = lead['priority']?.toString().toLowerCase() ?? 'medium';
          final hasOverdue = lead['nextFollowUpAt'] != null;

          Color priorityColor = AppColors.info;
          if (priority == 'high') priorityColor = AppColors.danger;
          if (priority == 'low') priorityColor = AppColors.neutral;

          return Card(
            child: InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: () async {
                final updated = await Navigator.of(context).push<bool>(
                  MaterialPageRoute(builder: (_) => LeadDetailScreen(leadId: leadId)),
                );
                if (updated == true) {
                  _fetchLeads(page: 1, reset: true);
                }
              },
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Text(
                            leadName,
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.bold,
                              color: AppColors.textPrimary,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: AppColors.primaryLight,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            statusName,
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: AppColors.primaryDark,
                            ),
                          ),
                        ),
                      ],
                    ),
                    if (company != null && company.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        company,
                        style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
                      ),
                    ],
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        if (leadCode != null)
                          Text(
                            leadCode,
                            style: const TextStyle(
                              fontSize: 11,
                              fontFamily: 'monospace',
                              color: AppColors.textMuted,
                            ),
                          ),
                        const Spacer(),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: priorityColor.withAlpha(25),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            priority.toUpperCase(),
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                              color: priorityColor,
                            ),
                          ),
                        ),
                        if (hasOverdue) ...[
                          const SizedBox(width: 6),
                          const Icon(Icons.alarm, size: 14, color: AppColors.danger),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
