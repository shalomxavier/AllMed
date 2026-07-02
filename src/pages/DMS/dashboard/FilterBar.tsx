interface FilterBarProps {
  selectedStore: string;
  onStoreChange: (storeId: string) => void;
  selectedDateRange: 'today' | 'yesterday' | 'last7days' | 'last30days';
  onDateRangeChange: (range: 'today' | 'yesterday' | 'last7days' | 'last30days') => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  selectedStore,
  onStoreChange,
  selectedDateRange,
  onDateRangeChange,
}) => {
  return (
    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
      {/* Store Filter - Placeholder for future implementation */}
      <div className="flex-1 min-w-[200px]">
        <label className="block text-xs text-secondary-500 mb-1">Store</label>
        <select
          value={selectedStore}
          onChange={(e) => onStoreChange(e.target.value)}
          className="w-full px-3 py-2 bg-white border border-secondary-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          disabled
        >
          <option value="all">All Stores</option>
        </select>
      </div>

      {/* Date Filter */}
      <div className="flex-1 min-w-[200px]">
        <label className="block text-xs text-secondary-500 mb-1">Date Range</label>
        <select
          value={selectedDateRange}
          onChange={(e) => onDateRangeChange(e.target.value as any)}
          className="w-full px-3 py-2 bg-white border border-secondary-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        >
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="last7days">Last 7 Days</option>
          <option value="last30days">Last 30 Days</option>
        </select>
      </div>
    </div>
  );
};
