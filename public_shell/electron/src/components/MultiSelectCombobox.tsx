import React, { useState, useEffect, useRef } from 'react';

interface MultiSelectComboboxProps {
  options: string[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function MultiSelectCombobox({
  options,
  selectedValues = [],
  onChange,
  placeholder = 'Add classes...',
  disabled = false
}: MultiSelectComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt =>
    opt.toLowerCase().includes(search.toLowerCase()) &&
    !selectedValues.includes(opt)
  );

  const handleRemove = (val: string) => {
    if (disabled) return;
    onChange(selectedValues.filter(x => x !== val));
  };

  const handleSelect = (val: string) => {
    if (disabled) return;
    onChange([...selectedValues, val]);
    setSearch('');
    setIsOpen(false);
  };

  return (
    <div 
      ref={containerRef}
      style={{ position: 'relative', width: '100%' }}
    >
      {/* Selected tags row + input */}
      <div 
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px',
          padding: '6px 8px',
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--glass-border, rgba(255,255,255,0.08))',
          borderRadius: '8px',
          minHeight: '38px',
          alignItems: 'center',
          cursor: disabled ? 'not-allowed' : 'text'
        }}
        onClick={() => !disabled && setIsOpen(true)}
      >
        {selectedValues.map(val => (
          <span 
            key={val}
            style={{
              background: 'rgba(0, 229, 255, 0.08)',
              border: '1px solid rgba(0, 229, 255, 0.2)',
              borderRadius: '16px',
              padding: '2px 8px',
              fontSize: '11px',
              color: '#00E5FF',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {val}
            <span 
              onClick={(e) => {
                e.stopPropagation();
                handleRemove(val);
              }}
              style={{ cursor: 'pointer', opacity: 0.7, fontWeight: 800 }}
            >
              &times;
            </span>
          </span>
        ))}
        
        <input 
          type="text"
          disabled={disabled}
          placeholder={selectedValues.length === 0 ? placeholder : ''}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          style={{
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#fff',
            fontSize: '13px',
            flex: 1,
            minWidth: '80px',
            padding: '2px 0'
          }}
        />
      </div>

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
                onClick={() => handleSelect(opt)}
                style={{
                  padding: '8px 12px',
                  fontSize: '13px',
                  color: '#fff',
                  cursor: 'pointer',
                  transition: 'background 0.15s'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'transparent';
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
