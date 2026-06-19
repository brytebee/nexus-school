import React, { useState, useEffect, useRef } from 'react';

interface ComboboxProps {
  options: string[];
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Select option...',
  disabled = false,
  style
}: ComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync search state when external value changes
  useEffect(() => {
    setSearch(value);
  }, [value]);

  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch(value); // Revert search term to current actual value
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [value]);

  const filteredOptions = options.filter(opt =>
    opt.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div 
      ref={containerRef} 
      style={{ position: 'relative', width: '100%', userSelect: 'none', ...style }}
    >
      <input
        type="text"
        disabled={disabled}
        placeholder={placeholder}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        className="modern-input"
        style={{
          width: '100%',
          paddingRight: '30px',
          cursor: disabled ? 'not-allowed' : 'text'
        }}
      />
      
      {/* Arrow Indicator */}
      <span 
        onClick={() => !disabled && setIsOpen(!isOpen)}
        style={{
          position: 'absolute',
          right: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'rgba(255,255,255,0.4)',
          fontSize: '10px',
          cursor: disabled ? 'not-allowed' : 'pointer'
        }}
      >
        {isOpen ? '▲' : '▼'}
      </span>

      {isOpen && !disabled && (
        <div 
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: '#0d1235',
            border: '1px solid var(--glass-border, rgba(255,255,255,0.08))',
            borderRadius: '6px',
            maxHeight: '200px',
            overflowY: 'auto',
            zIndex: 9999,
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
            scrollbarWidth: 'thin'
          }}
        >
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt) => (
              <div
                key={opt}
                onClick={() => {
                  onChange(opt);
                  setSearch(opt);
                  setIsOpen(false);
                }}
                style={{
                  padding: '8px 12px',
                  fontSize: '13px',
                  color: opt === value ? '#00E5FF' : '#fff',
                  background: opt === value ? 'rgba(0, 229, 255, 0.08)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'background 0.15s'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = opt === value ? 'rgba(0, 229, 255, 0.08)' : 'transparent';
                }}
              >
                {opt}
              </div>
            ))
          ) : (
            <div style={{ padding: '8px 12px', fontSize: '12px', color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>
              No matches found
            </div>
          )}
        </div>
      )}
    </div>
  );
}
