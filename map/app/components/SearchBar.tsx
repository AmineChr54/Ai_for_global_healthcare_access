"use client";

import { useState, useRef, useEffect } from "react";

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  selectedSpecialty: string;
  onSpecialtyChange: (v: string) => void;
  allSpecialties: string[];
}

function formatSpecialty(raw: string): string {
  // Convert camelCase to human-readable: "internalMedicine" -> "Internal Medicine"
  return raw
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .replace(/And /g, "& ")
    .trim();
}

export default function SearchBar({
  search,
  onSearchChange,
  selectedSpecialty,
  onSpecialtyChange,
  allSpecialties,
}: Props) {
  const [specialtyOpen, setSpecialtyOpen] = useState(false);
  const [specFilter, setSpecFilter] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setSpecialtyOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filteredSpecialties = allSpecialties.filter((s) =>
    formatSpecialty(s).toLowerCase().includes(specFilter.toLowerCase())
  );

  return (
    <div className="search-bar-container">
      <div className="search-bar">
        {/* Country section */}
        <div className="search-bar-section search-bar-country">
          <span className="search-bar-flag">{"\uD83C\uDDEC\uD83C\uDDED"}</span>
          <span className="search-bar-country-name">Ghana</span>
        </div>

        <div className="search-bar-divider" />

        {/* Specialty section */}
        <div className="search-bar-section search-bar-specialty" ref={dropdownRef}>
          <button
            className="search-bar-specialty-btn"
            onClick={() => {
              setSpecialtyOpen(!specialtyOpen);
              setSpecFilter("");
            }}
          >
            {selectedSpecialty ? (
              <span className="search-bar-specialty-active">
                {formatSpecialty(selectedSpecialty)}
                <button
                  className="search-bar-specialty-clear"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSpecialtyChange("");
                    setSpecialtyOpen(false);
                  }}
                >
                  &times;
                </button>
              </span>
            ) : (
              <span className="search-bar-placeholder">Add specialty</span>
            )}
          </button>

          {specialtyOpen && (
            <div className="search-bar-dropdown">
              <input
                type="text"
                value={specFilter}
                onChange={(e) => setSpecFilter(e.target.value)}
                placeholder="Search specialties..."
                className="search-bar-dropdown-input"
                autoFocus
              />
              <div className="search-bar-dropdown-list">
                {filteredSpecialties.slice(0, 20).map((s) => (
                  <button
                    key={s}
                    className={`search-bar-dropdown-item ${s === selectedSpecialty ? "active" : ""}`}
                    onClick={() => {
                      onSpecialtyChange(s === selectedSpecialty ? "" : s);
                      setSpecialtyOpen(false);
                    }}
                  >
                    {formatSpecialty(s)}
                  </button>
                ))}
                {filteredSpecialties.length === 0 && (
                  <div className="search-bar-dropdown-empty">No specialties found</div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="search-bar-divider" />

        {/* Keyword section */}
        <div className="search-bar-section search-bar-keyword">
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Add keyword"
            className="search-bar-keyword-input"
          />
          {search && (
            <button className="search-bar-keyword-clear" onClick={() => onSearchChange("")}>
              &times;
            </button>
          )}
        </div>

        {/* Search button */}
        <button className="search-bar-btn">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
