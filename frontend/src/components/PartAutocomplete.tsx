import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

interface PartSuggestion {
  name: string;
  score: number;
  usage_count: number;
  last_used: string | null;
  is_confirmed: boolean;
}

interface PartAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (part: string) => void;
  placeholder?: string;
}

const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export function PartAutocomplete({ value, onChange, onSelect, placeholder }: PartAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<PartSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (value.length < 1) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      try {
        const response = await apiClient.post<PartSuggestion[]>('/parts/search', {
          query: value,
          limit: 10
        });
        setSuggestions(response.data);
        setShowSuggestions(response.data.length > 0);
        setSelectedIndex(0);
      } catch (error) {
        console.error('Failed to fetch suggestions:', error);
        setSuggestions([]);
      }
    };

    const debounce = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(debounce);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = async (part: PartSuggestion) => {
    onChange(part.name);
    setShowSuggestions(false);

    // 사용 이력 기록
    try {
      await apiClient.post('/parts/record', {
        part_name: part.name,
        input_text: value || part.name,
      });
    } catch (error) {
      console.error('Failed to record part usage:', error);
    }

    onSelect?.(part.name);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % suggestions.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
        break;
      case 'Enter':
        e.preventDefault();
        if (suggestions[selectedIndex]) {
          handleSelect(suggestions[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        break;
    }
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || '부품명을 입력하세요...'}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {suggestions.map((suggestion, index) => (
            <div
              key={index}
              onClick={() => handleSelect(suggestion)}
              className={`px-4 py-2 cursor-pointer transition-colors ${
                index === selectedIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{suggestion.name}</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      suggestion.is_confirmed
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {suggestion.is_confirmed ? '확정' : '검토'}
                  </span>
                </div>
                <div className="flex gap-2 text-xs text-gray-500">
                  <span>유사도: {(suggestion.score * 100).toFixed(0)}%</span>
                  <span>사용: {suggestion.usage_count}회</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
