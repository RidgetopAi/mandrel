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

export const highlightSearchTerms = (text: string, searchTerm?: string): string => {
  if (!searchTerm || !searchTerm.trim()) {
    return text;
  }

  const terms = searchTerm.trim().split(/\s+/);
  let highlightedText = text;

  terms.forEach((term) => {
    const regex = new RegExp(`(${term})`, 'gi');
    highlightedText = highlightedText.replace(
      regex,
      '<mark style="background-color: #fff3cd; padding: 2px;">$1</mark>'
    );
  });

  return highlightedText;
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};
