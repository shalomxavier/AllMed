import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, Check } from 'lucide-react';

interface DropdownItem {
  id: string;
  name: string;
  subtitle?: string;
}

interface MultiSelectDropdownProps {
  items: DropdownItem[];
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  itemLabel?: string;
  showSearch?: boolean;
}

export const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({
  items,
  selectedIds,
  onChange,
  label,
  placeholder = 'Select items',
  disabled = false,
  searchPlaceholder = 'Search...',
  emptyText = 'No items found',
  itemLabel = 'item',
  showSearch = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) && 
          buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleDropdown = () => {
    if (disabled) return;
    
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
    setIsOpen(!isOpen);
  };

  const filteredItems = (showSearch ? items.filter((item) => {
    const query = searchQuery.toLowerCase();
    const name = item.name?.toLowerCase() || '';
    const subtitle = item.subtitle?.toLowerCase() || '';
    return name.includes(query) || subtitle.includes(query);
  }) : items).sort((a, b) => {
    const aSelected = selectedIds.includes(a.id);
    const bSelected = selectedIds.includes(b.id);
    if (aSelected && !bSelected) return -1;
    if (!aSelected && bSelected) return 1;
    return 0;
  });

  const toggleItem = (itemId: string) => {
    if (selectedIds.includes(itemId)) {
      onChange(selectedIds.filter((id) => id !== itemId));
    } else {
      onChange([...selectedIds, itemId]);
    }
  };

  const selectedItems = items.filter((e) => selectedIds.includes(e.id));

  return (
    <div className="relative">
      {label && (
        <label className="block text-sm font-medium text-secondary-700 mb-1">
          {label}
        </label>
      )}
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleDropdown}
        disabled={disabled}
        className="w-full px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-white text-left flex items-center justify-between disabled:opacity-70 disabled:cursor-not-allowed"
      >
        <span className={selectedItems.length === 0 ? 'text-secondary-400' : 'text-secondary-900'}>
          {selectedItems.length === 0
            ? placeholder
            : `${selectedItems.length} ${itemLabel}${selectedItems.length !== 1 ? 's' : ''} selected`}
        </span>
        <ChevronDown size={16} className="text-secondary-500 ml-2 flex-shrink-0" />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[9999] bg-white border border-secondary-200 rounded-lg shadow-lg max-h-60 overflow-hidden flex flex-col"
            style={{
              top: `${dropdownPosition.top}px`,
              left: `${dropdownPosition.left}px`,
              width: `${dropdownPosition.width}px`,
            }}
          >
            <div className="p-2 border-b border-secondary-200">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-secondary-700">
                  {selectedItems.length} {itemLabel}{selectedItems.length !== 1 ? 's' : ''} selected
                </span>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="text-xs text-cyan-600 hover:text-cyan-700 font-medium"
                >
                  Done
                </button>
              </div>
              {showSearch && (
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="w-full pl-9 pr-3 py-1.5 text-sm border border-secondary-200 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              )}
            </div>

            <div className="overflow-y-auto flex-1">
              {filteredItems.length === 0 ? (
                <div className="p-4 text-center text-sm text-secondary-500">
                  {emptyText}
                </div>
              ) : (
                filteredItems.map((item) => {
                  const isSelected = selectedIds.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleItem(item.id)}
                      className="w-full px-3 py-2 text-sm text-left hover:bg-secondary-50 flex items-center gap-3 transition-colors"
                    >
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                          isSelected ? 'bg-cyan-600 border-cyan-600' : 'border-secondary-300 bg-white'
                        }`}
                      >
                        {isSelected && <Check size={12} className="text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-secondary-900 truncate">
                          {item.name || 'Unnamed'}
                        </div>
                        {item.subtitle && (
                          <div className="text-xs text-secondary-500 truncate">
                            {item.subtitle}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};
