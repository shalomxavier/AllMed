import type { EnquiryStatus } from '../types';

interface FilterChipsProps {
  activeFilter: EnquiryStatus | 'All';
  onFilterChange: (filter: EnquiryStatus | 'All') => void;
}

const filters: (EnquiryStatus | 'All')[] = ['All', 'New', 'In Progress', 'Follow-up', 'Converted', 'Lost'];

const filterColors: Record<EnquiryStatus | 'All', string> = {
  'All': 'bg-secondary-100 text-secondary-700 border-secondary-300',
  'New': 'bg-blue-100 text-blue-700 border-blue-300',
  'In Progress': 'bg-orange-100 text-orange-700 border-orange-300',
  'Follow-up': 'bg-purple-100 text-purple-700 border-purple-300',
  'Converted': 'bg-green-100 text-green-700 border-green-300',
  'Lost': 'bg-red-100 text-red-700 border-red-300',
};

export const FilterChips: React.FC<FilterChipsProps> = ({
  activeFilter,
  onFilterChange,
}) => {
  return (
    <div className="flex flex-wrap gap-2">
      {filters.map((filter) => (
        <button
          key={filter}
          onClick={() => onFilterChange(filter)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
            activeFilter === filter
              ? filterColors[filter]
              : 'bg-white text-secondary-600 border-secondary-300 hover:bg-secondary-50'
          }`}
        >
          {filter}
        </button>
      ))}
    </div>
  );
};
