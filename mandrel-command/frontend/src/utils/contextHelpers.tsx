import React from 'react';

export const getTypeDisplayName = (type: string): string => {
  const typeMap: Record<string, string> = {
    code: 'Code',
    decision: 'Decision',
    error: 'Error',
    discussion: 'Discussion',
    planning: 'Planning',
    completion: 'Completion',
  };
  return typeMap[type] || type;
};

export const getTypeColor = (type: string): string => {
  const colorMap: Record<string, string> = {
    code: '#1890ff',
    decision: '#722ed1',
    error: '#ff4d4f',
    discussion: '#13c2c2',
    planning: '#52c41a',
    completion: '#fa8c16',
  };
  return colorMap[type] || '#8c8c8c';
};

export const truncateContent = (content: string, maxLength = 150): string => {
  if (content.length <= maxLength) {
    return content;
  }
  return `${content.substring(0, maxLength).trim()}...`;
};

/**
 * Safe search term highlighting that returns React nodes instead of HTML strings
 * Prevents XSS vulnerabilities from dangerouslySetInnerHTML
 */
export const highlightSearchTermsAsNodes = (
  text: string,
  searchTerm?: string
): React.ReactNode => {
  if (!searchTerm?.trim()) {
    return text;
  }

  const terms = searchTerm.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return text;
  }

  // Escape special regex characters in search terms
  const escapedTerms = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escapedTerms.join('|')})`, 'gi');
  
  const parts = text.split(regex);
  
  return parts.map((part, i) => {
    // Check if this part matches any search term
    const isMatch = terms.some(term => 
      part.toLowerCase() === term.toLowerCase()
    );
    
    return isMatch ? (
      <mark key={i} style={{ backgroundColor: '#fff3cd', padding: 2 }}>
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    );
  });
};

