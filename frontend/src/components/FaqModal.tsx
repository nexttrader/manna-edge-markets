import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { FAQ_DATA } from '../data/faqData';
import { useAuth } from '../context/AuthContext';
import './FaqModal.css';

interface FaqModalProps {
  onClose: () => void;
}

export const FaqModal: React.FC<FaqModalProps> = ({ onClose }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [openFaqId, setOpenFaqId] = useState<string | null>(FAQ_DATA[0]?.id || null);
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin'>('all');

  // Filter categories based on available FAQ items for user role
  const availableFaqs = useMemo(() => {
    return FAQ_DATA.filter(item => {
      if (item.roleRequired === 'admin' && !isAdmin) return false;
      if (roleFilter === 'admin' && item.roleRequired !== 'admin') return false;
      return true;
    });
  }, [isAdmin, roleFilter]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    availableFaqs.forEach(item => set.add(item.category));
    return ['All', ...Array.from(set)];
  }, [availableFaqs]);

  const filteredFaqs = useMemo(() => {
    return availableFaqs.filter(item => {
      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q || 
        item.question.toLowerCase().includes(q) || 
        item.answer.toLowerCase().includes(q) ||
        item.tags.some(t => t.toLowerCase().includes(q));
      return matchesCategory && matchesSearch;
    });
  }, [availableFaqs, selectedCategory, searchQuery]);

  const toggleAccordion = (id: string) => {
    setOpenFaqId(prev => (prev === id ? null : id));
  };

  return createPortal(
    <div className="faq-modal-backdrop font-sans">
      <div className="faq-modal-content glass-card animate-fade-in">
        {/* Header */}
        <div className="faq-modal-header">
          <div className="faq-title-group">
            <h2 className="faq-title">
              ❓ Knowledge Base & FAQ{' '}
              <span className={`role-badge ${isAdmin ? 'admin' : 'trader'}`}>
                {isAdmin ? '🛡️ ADMIN ACCESS' : '👤 TRADER ACCESS'}
              </span>
            </h2>
            <p className="faq-subtitle">
              Comprehensive guide to Manna Edge Markets 2.0 discovery engine, strategies, execution rules, and admin tools.
            </p>
          </div>
          <button className="faq-close-btn font-mono" onClick={onClose}>✕</button>
        </div>

        {/* Search & Role Filter Bar */}
        <div className="faq-controls font-mono">
          <div className="faq-search-wrapper">
            <span className="search-icon">🔍</span>
            <input 
              type="text"
              className="faq-search-input"
              placeholder="Search features, strategies, orders, killzones..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="clear-search" onClick={() => setSearchQuery('')}>✕</button>
            )}
          </div>

          {isAdmin && (
            <div className="faq-role-toggle">
              <button 
                className={`role-tab ${roleFilter === 'all' ? 'active' : ''}`}
                onClick={() => setRoleFilter('all')}
              >
                🌐 All Guides
              </button>
              <button 
                className={`role-tab admin-tab ${roleFilter === 'admin' ? 'active' : ''}`}
                onClick={() => setRoleFilter('admin')}
              >
                🛡️ Admin Manual
              </button>
            </div>
          )}
        </div>

        {/* Category Pills */}
        <div className="faq-categories-bar font-mono">
          {categories.map(cat => (
            <button
              key={cat}
              className={`cat-pill ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Accordion List */}
        <div className="faq-accordion-container">
          {filteredFaqs.length > 0 ? (
            filteredFaqs.map(item => {
              const isOpen = openFaqId === item.id;
              const isAdminOnly = item.roleRequired === 'admin';

              return (
                <div key={item.id} className={`faq-card ${isOpen ? 'open' : ''} ${isAdminOnly ? 'admin-card' : ''}`}>
                  <button className="faq-question-btn" onClick={() => toggleAccordion(item.id)}>
                    <div className="question-left">
                      <span className="category-tag font-mono">{item.category}</span>
                      {isAdminOnly && <span className="admin-tag font-mono">🛡️ ADMIN</span>}
                      <span className="question-text">{item.question}</span>
                    </div>
                    <span className="chevron-icon">{isOpen ? '▲' : '▼'}</span>
                  </button>

                  {isOpen && (
                    <div className="faq-answer-body animate-fade-in">
                      <p className="answer-text">{item.answer}</p>
                      <div className="faq-card-footer font-mono">
                        <div className="tags-group">
                          {item.tags.map(tag => (
                            <span key={tag} className="tag-chip">#{tag}</span>
                          ))}
                        </div>
                        <span className="updated-at">Updated: {item.updatedAt}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="faq-empty font-mono">
              <span>🔍 No matching documentation found for "{searchQuery}". Try a different search term.</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="faq-modal-footer font-mono">
          <span>📚 Manna Edge Markets 2.0 • Knowledge Base Engine (Auto-syncs on new releases)</span>
          <button className="btn-close-bottom" onClick={onClose}>Close Guide</button>
        </div>
      </div>
    </div>,
    document.body
  );
};
