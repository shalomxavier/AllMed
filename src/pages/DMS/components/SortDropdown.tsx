import { ArrowUpDown } from 'lucide-react';

type SortOption = 'newest' | 'oldest' | 'unreadFirst' | 'followUpFirst';

interface SortDropdownProps {
  value: SortOption;
  onChange: (value: SortOption) => void;
}

const sortOptions: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'unreadFirst', label: 'Unread First' },
  { value: 'followUpFirst', label: 'Follow-up First' },
];

export const SortDropdown: React.FC<SortDropdownProps> = ({ value, onChange }) => {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SortOption)}
        className="appearance-none pl-9 pr-8 py-2 bg-white border border-secondary-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent cursor-pointer"
      >
        {sortOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ArrowUpDown
        size={16}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400 pointer-events-none"
      />
    </div>
  );
};
