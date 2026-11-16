import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  EDGE_FINDER_KB_TOPICS,
  type EdgeFinderKbCategory,
  type EdgeFinderKbTopic,
  type EdgeFinderKbTopicId,
  getEdgeFinderKbTopic
} from '../../data/edgeFinderKnowledgeBase';
import { useEdgeFinderAccess } from '../../hooks/useEdgeFinder';

interface EdgeFinderHelpButtonProps {
  topicId: EdgeFinderKbTopicId;
  onOpenTopic: (id: EdgeFinderKbTopicId) => void;
}

export const EdgeFinderHelpButton: React.FC<EdgeFinderHelpButtonProps> = ({ topicId, onOpenTopic }) => {
  const topic = getEdgeFinderKbTopic(topicId);
  return (
    <button
      type="button"
      className="ef-help-btn"
      aria-label={`Open Knowledge Base for ${topic.shortTitle}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpenTopic(topicId);
      }}
    >
      ?
    </button>
  );
};

interface TopicBodyProps {
  topic: EdgeFinderKbTopic;
  onSelectTopic?: (id: EdgeFinderKbTopicId) => void;
}

const TopicDetailsContent: React.FC<TopicBodyProps> = ({ topic, onSelectTopic }) => {
  const { isSuperAdmin } = useEdgeFinderAccess();

  return (
    <div className="ef-kb-body">
      <div className="ef-kb-meta-row">
        <span className="ef-kz-pill ef-kz-aligned">{topic.category}</span>
        <span className="ef-mini-chip">Source: {topic.dataSource}</span>
        <span className="ef-mini-chip">Refresh: {topic.updateCadence}</span>
      </div>

      <p className="ef-kb-summary">{topic.summary}</p>

      <div className="ef-kb-section">
        <div className="ef-kb-section-label">What It Does &amp; Why Traders Use It</div>
        <p className="ef-kb-text">{topic.whatItIs}</p>
      </div>

      <div className="ef-kb-section ef-kb-section-simple">
        <div className="ef-kb-section-label">💡 How It Works (Simple Language)</div>
        <ul className="ef-kb-list">
          {topic.simpleExplanation.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>

      {isSuperAdmin && (
        <div className="ef-kb-section ef-kb-section-superadmin">
          <div className="ef-kb-section-label" style={{ color: 'var(--ef-purple-soft, #f3c6ff)' }}>
            👑 Super Admin Only — Proprietary Calculation &amp; Weights
          </div>
          <ul className="ef-kb-list">
            {topic.calculationFormula.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="ef-kb-section">
        <div className="ef-kb-section-label">Execution Playbook by Trading Style</div>
        <div className="ef-kb-horizon-grid">
          <div className="ef-kb-horizon-box">
            <div className="ef-kb-h-title">⚡ Scalper (M5–M15 · 15m–2h)</div>
            <p className="ef-kb-h-text">{topic.howToTrade.scalper}</p>
          </div>
          <div className="ef-kb-horizon-box">
            <div className="ef-kb-h-title">⏱️ Intraday (H1–H4 · 2h–24h)</div>
            <p className="ef-kb-h-text">{topic.howToTrade.intraday}</p>
          </div>
          <div className="ef-kb-horizon-box">
            <div className="ef-kb-h-title">🏛️ Swing (D1–W1 · 3d–4w)</div>
            <p className="ef-kb-h-text">{topic.howToTrade.swing}</p>
          </div>
        </div>
      </div>

      <div className="ef-kb-section">
        <div className="ef-kb-section-label">Reading Signals Quickly</div>
        <ul className="ef-kb-list">
          {topic.readingSignals.map((sig, i) => (
            <li key={i}>{sig}</li>
          ))}
        </ul>
      </div>

      {topic.relatedIds.length > 0 && onSelectTopic && (
        <div className="ef-kb-related">
          <span style={{ fontSize: '0.73rem', color: 'var(--ef-text-muted, #a99bc9)', fontWeight: 600 }}>Related Topics:</span>
          {topic.relatedIds.map((relId) => {
            const rel = getEdgeFinderKbTopic(relId);
            return (
              <button
                key={relId}
                type="button"
                className="ef-filter-btn"
                style={{ padding: '4px 10px', fontSize: '0.72rem' }}
                onClick={() => onSelectTopic(relId)}
              >
                {rel.shortTitle} →
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

interface EdgeFinderKbDialogProps {
  activeTopicId: EdgeFinderKbTopicId | null;
  onSelectTopic: (id: EdgeFinderKbTopicId) => void;
  onClose: () => void;
  onOpenFullTab: () => void;
}

export const EdgeFinderKbDialog: React.FC<EdgeFinderKbDialogProps> = ({
  activeTopicId,
  onSelectTopic,
  onClose,
  onOpenFullTab
}) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const topic = activeTopicId ? getEdgeFinderKbTopic(activeTopicId) : null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (activeTopicId && !dialog.open) {
      dialog.showModal();
    } else if (!activeTopicId && dialog.open) {
      dialog.close();
    }
  }, [activeTopicId]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleNativeClose = () => {
      dialog.returnValue = '';
      onClose();
    };
    dialog.addEventListener('close', handleNativeClose);

    // Mandatory fallback for browsers without native <dialog closedby="any">
    let cleanFallback: (() => void) | undefined;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      let pressedOutside = false;
      const isOutside = (e: PointerEvent) => {
        const rect = dialog.getBoundingClientRect();
        return e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom;
      };
      const onPointerDown = (e: PointerEvent) => {
        pressedOutside = isOutside(e);
      };
      const onPointerUp = (e: PointerEvent) => {
        if (pressedOutside && isOutside(e)) {
          dialog.close();
        }
        pressedOutside = false;
      };
      dialog.addEventListener('pointerdown', onPointerDown);
      dialog.addEventListener('pointerup', onPointerUp);
      cleanFallback = () => {
        dialog.removeEventListener('pointerdown', onPointerDown);
        dialog.removeEventListener('pointerup', onPointerUp);
      };
    }

    return () => {
      dialog.removeEventListener('close', handleNativeClose);
      cleanFallback?.();
    };
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      {...({ closedby: 'any' } as any)}
      aria-labelledby="ef-kb-dialog-title"
      className="ef-kb-dialog"
    >
      {topic && (
        <div className="ef-kb-dialog-shell">
          <div className="ef-card-header" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="ef-pro-pill">{topic.badge}</span>
              <h2 id="ef-kb-dialog-title" className="ef-card-title" style={{ fontSize: '1.02rem' }}>
                {topic.title}
              </h2>
            </div>
            <button
              type="button"
              className="ef-btn"
              onClick={() => dialogRef.current?.close()}
              aria-label="Close Knowledge Base modal"
            >
              ✕
            </button>
          </div>

          <TopicDetailsContent topic={topic} onSelectTopic={onSelectTopic} />

          <div className="ef-kb-dialog-footer">
            <button type="button" className="ef-btn ef-btn-gold" onClick={onOpenFullTab}>
              📘 Browse All {EDGE_FINDER_KB_TOPICS.length} EdgeFinder Guides
            </button>
            <button
              type="button"
              className="ef-btn"
              autoFocus
              onClick={() => dialogRef.current?.close()}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
};

const KB_CATEGORIES: Array<'ALL' | EdgeFinderKbCategory> = [
  'ALL',
  'Scoring & Horizons',
  'Scanner & Matrix',
  'COT & Sentiment',
  'Macro & Yields',
  'Futures, Gold & Crypto',
  'Technicals, Seasonality & Feeds'
];

export const EdgeFinderKbExplorer: React.FC = () => {
  const { isSuperAdmin } = useEdgeFinderAccess();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | EdgeFinderKbCategory>('ALL');
  const [openIds, setOpenIds] = useState<Set<EdgeFinderKbTopicId>>(
    () => new Set<EdgeFinderKbTopicId>(['horizon_engine', 'scanner_matrix'])
  );

  const filteredTopics = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return EDGE_FINDER_KB_TOPICS.filter((t) => {
      if (selectedCategory !== 'ALL' && t.category !== selectedCategory) return false;
      if (!q) return true;
      const haystack = [
        t.title,
        t.shortTitle,
        t.category,
        t.summary,
        t.whatItIs,
        t.dataSource,
        ...t.simpleExplanation,
        ...(isSuperAdmin ? t.calculationFormula : []),
        ...t.readingSignals
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [searchQuery, selectedCategory, isSuperAdmin]);

  const allExpanded = filteredTopics.length > 0 && filteredTopics.every((t) => openIds.has(t.id));

  const handleToggleAll = () => {
    if (allExpanded) {
      setOpenIds(new Set());
    } else {
      setOpenIds(new Set(filteredTopics.map((t) => t.id)));
    }
  };

  const handleSelectRelated = (id: EdgeFinderKbTopicId) => {
    setSelectedCategory('ALL');
    setSearchQuery('');
    setOpenIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    window.setTimeout(() => {
      const el = document.getElementById(`ef-kb-item-${id}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 40);
  };

  return (
    <section className="ef-card ef-perf-section" aria-labelledby="ef-kb-explorer-heading">
      <div className="ef-card-header">
        <div>
          <h2 id="ef-kb-explorer-heading" className="ef-card-title">
            📘 Manna EdgeFinder Pro Knowledge Base ({EDGE_FINDER_KB_TOPICS.length} Interactive Guides)
          </h2>
          <p className="ef-subtitle" style={{ marginTop: 4 }}>
            {isSuperAdmin
              ? 'Full guides, proprietary calculation weights, live feed cadences, and Scalper / Intraday / Swing playbooks for every EdgeFinder display.'
              : 'Plain-English guides, live feed cadences, and Scalper / Intraday / Swing playbooks for every EdgeFinder display.'}
          </p>
        </div>
        <button
          type="button"
          className="ef-btn"
          aria-expanded={allExpanded}
          onClick={handleToggleAll}
        >
          {allExpanded ? 'Collapse all' : 'Expand all'}
        </button>
      </div>

      <search className="ef-toolbar" style={{ marginBottom: 14 }}>
        <div className="ef-filter-pills" role="group" aria-label="Filter Knowledge Base Category">
          {KB_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`ef-filter-btn ${selectedCategory === cat ? 'is-active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat === 'ALL' ? `All Guides (${EDGE_FINDER_KB_TOPICS.length})` : cat}
            </button>
          ))}
        </div>

        <input
          type="search"
          className="ef-search-input"
          placeholder={isSuperAdmin ? 'Search guides, formulas, COT, ADR, Futures, Crypto...' : 'Search guides, COT, ADR, Futures, Crypto...'}
          aria-label="Search EdgeFinder Knowledge Base"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </search>

      {filteredTopics.length === 0 ? (
        <div className="ef-pillar-card" style={{ padding: 24, textAlign: 'center' }}>
          <strong style={{ color: 'var(--ef-gold, #DFC46B)' }}>No matching EdgeFinder guides found.</strong>
          <p style={{ margin: '6px 0 0', fontSize: '0.82rem', color: 'var(--ef-text-secondary, #b7a8d6)' }}>
            Try clearing the filter or searching for terms like &ldquo;Scalper&rdquo;, &ldquo;COT&rdquo;, &ldquo;Real Yield&rdquo;, or &ldquo;Carry&rdquo;.
          </p>
        </div>
      ) : (
        <div className="ef-kb-accordion">
          {filteredTopics.map((topic) => {
            const isOpen = openIds.has(topic.id);
            return (
              <details
                key={topic.id}
                id={`ef-kb-item-${topic.id}`}
                className="ef-kb-details"
                open={isOpen}
                onToggle={(e) => {
                  const openNow = (e.currentTarget as HTMLDetailsElement).open;
                  setOpenIds((prev) => {
                    const next = new Set(prev);
                    if (openNow) next.add(topic.id);
                    else next.delete(topic.id);
                    return next;
                  });
                }}
              >
                <summary className="ef-kb-summary-btn">
                  <span className="ef-kb-sum-main">
                    <span className="ef-kb-sum-title">{topic.title}</span>
                    <span className="ef-kb-sum-sub">{topic.summary}</span>
                  </span>
                  <span className="ef-kb-sum-badges">
                    <span className="ef-mini-chip">{topic.category}</span>
                    <span className="ef-kz-pill ef-kz-aligned">{topic.badge}</span>
                  </span>
                </summary>
                <div className="ef-kb-details-body">
                  <TopicDetailsContent topic={topic} onSelectTopic={handleSelectRelated} />
                </div>
              </details>
            );
          })}
        </div>
      )}
    </section>
  );
};
