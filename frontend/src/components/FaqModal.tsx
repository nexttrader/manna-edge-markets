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

  // User profile active strategies & tier (defaults to all active for admin/pro, dynamic for profile)
  const activeStrategies = useMemo(() => {
    return (user as any)?.active_strategies || ['manna_basic', 'manna_snd'];
  }, [user]);

  const userTier: 'free' | 'forex_only' | 'futures_forex' = (user as any)?.tier || (isAdmin ? 'futures_forex' : 'futures_forex');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [openFaqId, setOpenFaqId] = useState<string | null>(FAQ_DATA[0]?.id || null);
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin'>('all');
  const [feedbackState, setFeedbackState] = useState<Record<string, 'up' | 'down'>>({});

  // Dynamic filtering based on user role, active strategies, and tier
  const availableFaqs = useMemo(() => {
    return FAQ_DATA.filter(item => {
      // 1. Role check (Admin vs Trader)
      if (item.roleRequired === 'admin' && !isAdmin) return false;
      if (roleFilter === 'admin' && item.roleRequired !== 'admin') return false;

      // 2. Dynamic Strategy Activation check (Hides strategy FAQs if not active on user profile)
      if (item.strategyRequired && item.strategyRequired !== 'all') {
        if (!activeStrategies.includes(item.strategyRequired)) return false;
      }

      // 3. Dynamic Tier check
      if (item.tierRequired && item.tierRequired !== 'free') {
        if ((userTier as string) === 'free') return false;
      }

      return true;
    });
  }, [isAdmin, roleFilter, activeStrategies, userTier]);

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

  const handleFeedback = (id: string, type: 'up' | 'down') => {
    setFeedbackState(prev => ({ ...prev, [id]: type }));
  };

  return createPortal(
    <div className="faq-modal-backdrop font-sans">
      <div className="faq-modal-content glass-card animate-fade-in">
        {/* Header */}
        <div className="faq-modal-header">
          <div className="faq-header-left">
            <div className="faq-logo-emblem">⚡</div>
            <div>
              <h2 className="faq-header-title">
                KDT KNOWLEDGE BASE & FAQ
                <span className={`role-badge ${isAdmin ? 'admin' : 'trader'}`}>
                  {isAdmin ? '🛡️ ADMIN MANUAL' : '👤 TRADER GUIDE'}
                </span>
              </h2>
              <p className="faq-header-sub">
                Interactive documentation for Manna Edge Markets 2.0. KDT concepts, Killzones & Admin tools.
              </p>
            </div>
          </div>
          <button className="faq-close-btn font-mono" onClick={onClose} title="Close Guide">✕</button>
        </div>

        {/* Live Engine Sync Metrics Ribbon */}
        <div className="faq-metrics-ribbon font-mono">
          <span className="ribbon-item">📚 <strong>{filteredFaqs.length}</strong> {filteredFaqs.length === 1 ? 'Topic' : 'Topics'} Available</span>
          <span className="ribbon-divider">•</span>
          <span className="ribbon-item text-cyan">⚡ Dynamic Strategy Filter: Active</span>
          <span className="ribbon-divider">•</span>
          <span className="ribbon-item text-gold">{isAdmin ? '🛡️ Admin Privileges Active' : '🟢 Standard Trader Profile'}</span>
        </div>

        {/* Search & Role Control Bar */}
        <div className="faq-controls font-mono">
          <div className="faq-search-wrapper">
            <span className="search-icon">🔍</span>
            <input 
              type="text"
              className="faq-search-input"
              placeholder="Search KDT concepts, entry markers, Killzones, admin rescans..."
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

        {/* Category Pills Bar */}
        <div className="faq-categories-bar">
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

        {/* Accordion Cards List */}
        <div className="faq-accordion-container">
          {filteredFaqs.length > 0 ? (
            filteredFaqs.map(item => {
              const isOpen = openFaqId === item.id;
              const isAdminOnly = item.roleRequired === 'admin';
              const userFb = feedbackState[item.id];

              return (
                <div key={item.id} className={`faq-card ${isOpen ? 'open' : ''} ${isAdminOnly ? 'admin-card' : 'trader-card'}`}>
                  <button className="faq-question-btn" onClick={() => toggleAccordion(item.id)}>
                    <div className="question-left">
                      <span className={`category-badge ${isAdminOnly ? 'admin-cat' : ''}`}>{item.category}</span>
                      {isAdminOnly && <span className="admin-tag">🛡️ ADMIN ONLY</span>}
                      <span className="question-text">{item.question}</span>
                    </div>
                    <span className={`chevron-icon ${isOpen ? 'rotated' : ''}`}>▼</span>
                  </button>

                  {isOpen && (
                    <div className="faq-answer-body animate-fade-in">
                      <div className="answer-text">{item.answer}</div>
                      
                      <div className="faq-card-footer font-mono">
                        <div className="tags-group">
                          {item.tags.map(tag => (
                            <span key={tag} className="tag-chip">#{tag}</span>
                          ))}
                        </div>

                        <div className="faq-feedback-group">
                          <span className="feedback-label">Helpful?</span>
                          <button 
                            className={`feedback-btn ${userFb === 'up' ? 'active-up' : ''}`}
                            onClick={() => handleFeedback(item.id, 'up')}
                            title="Yes, this answered my question"
                          >
                            👍 {userFb === 'up' ? 'Yes' : ''}
                          </button>
                          <button 
                            className={`feedback-btn ${userFb === 'down' ? 'active-down' : ''}`}
                            onClick={() => handleFeedback(item.id, 'down')}
                            title="No, needs improvement"
                          >
                            👎
                          </button>
                          <span className="updated-at">Updated: {item.updatedAt}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="faq-empty font-mono">
              <span className="empty-icon">🔍</span>
              <p>No matching documentation found for "<strong>{searchQuery}</strong>".</p>
              <button className="reset-search-btn" onClick={() => { setSearchQuery(''); setSelectedCategory('All'); }}>
                ↺ Clear Search Filters
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="faq-modal-footer font-mono">
          <div className="footer-left">
            <span>⚡ Manna Edge Markets 2.0 • Dynamic KDT Architecture</span>
          </div>
          <button className="btn-close-bottom" onClick={onClose}>Close Knowledge Hub</button>
        </div>
      </div>
    </div>,
    document.body
  );
};
