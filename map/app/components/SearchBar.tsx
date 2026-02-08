"use client";

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
}

export default function SearchBar({ search, onSearchChange }: Props) {
  return (
    <div className="search-bar-container">
      <div className="search-bar">
        {/* Country section */}
        <div className="search-bar-section search-bar-country">
          <span className="search-bar-flag">{"\uD83C\uDDEC\uD83C\uDDED"}</span>
          <span className="search-bar-country-name">Ghana</span>
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
