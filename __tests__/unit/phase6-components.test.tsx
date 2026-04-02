/**
 * Phase 6 — Component unit tests (T6.1–T6.9)
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TemplateBadge } from '../../components/ui/TemplateBadge';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { HealthBar } from '../../components/ui/HealthBar';
import { ConfidenceBar } from '../../components/ui/ConfidenceBar';
import { StatCard } from '../../components/ui/StatCard';

// ── T6.1: TemplateBadge T5 ───────────────────────────────────

describe('T6.1 — TemplateBadge T5', () => {
  it('renders pill with text T5 and teal colours', () => {
    const { container } = render(<TemplateBadge templateType="T5" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.textContent).toBe('T5');
    expect(el.style.background).toMatch(/#ccfbf1|rgb\(204, 251, 241\)/i);
    expect(el.style.color).toMatch(/#134e4a|rgb\(19, 78, 74\)/i);
  });
});

// ── T6.2: TemplateBadge T8 ───────────────────────────────────

describe('T6.2 — TemplateBadge T8', () => {
  it('renders pill with text T8 and teal colours', () => {
    const { container } = render(<TemplateBadge templateType="T8" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.textContent).toBe('T8');
    expect(el.style.background).toMatch(/#ccfbf1|rgb\(204, 251, 241\)/i);
    expect(el.style.color).toMatch(/#134e4a|rgb\(19, 78, 74\)/i);
  });
});

// ── T6.3: StatusBadge needs_review ───────────────────────────

describe('T6.3 — StatusBadge needs_review', () => {
  it('renders amber pill with "Needs review"', () => {
    const { container } = render(<StatusBadge status="needs_review" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.textContent).toBe('Needs review');
    expect(el.style.background).toMatch(/#fef3c7|rgb\(254, 243, 199\)/i);
  });
});

// ── T6.4: StatusBadge auto_approved ──────────────────────────

describe('T6.4 — StatusBadge auto_approved', () => {
  it('renders green pill with "Approved"', () => {
    const { container } = render(<StatusBadge status="auto_approved" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.textContent).toBe('Approved');
    expect(el.style.background).toMatch(/#dcfce7|rgb\(220, 252, 231\)/i);
  });
});

// ── T6.5: HealthBar 95 → green ───────────────────────────────

describe('T6.5 — HealthBar value=95', () => {
  it('renders green fill at 95% width', () => {
    const { getByTestId } = render(<HealthBar value={95} />);
    const fill = getByTestId('health-bar-fill');
    expect(fill.style.width).toBe('95%');
    expect(fill.style.background).toMatch(/#15803d|rgb\(21, 128, 61\)/i);
  });
});

// ── T6.6: HealthBar 50 → red ─────────────────────────────────

describe('T6.6 — HealthBar value=50', () => {
  it('renders red fill at 50% width', () => {
    const { getByTestId } = render(<HealthBar value={50} />);
    const fill = getByTestId('health-bar-fill');
    expect(fill.style.width).toBe('50%');
    expect(fill.style.background).toMatch(/#b91c1c|rgb\(185, 28, 28\)/i);
  });
});

// ── T6.7: ConfidenceBar 0.97 → green ─────────────────────────

describe('T6.7 — ConfidenceBar value=0.97', () => {
  it('renders green bar and "97%" text', () => {
    const { getByTestId } = render(<ConfidenceBar value={0.97} />);
    expect(screen.getByText('97%')).toBeTruthy();
    const fill = getByTestId('confidence-bar-fill');
    expect(fill.style.background).toMatch(/#15803d|rgb\(21, 128, 61\)/i);
  });
});

// ── T6.8: ConfidenceBar 0.65 → red ───────────────────────────

describe('T6.8 — ConfidenceBar value=0.65', () => {
  it('renders red bar and "65%" text', () => {
    const { getByTestId } = render(<ConfidenceBar value={0.65} />);
    expect(screen.getByText('65%')).toBeTruthy();
    const fill = getByTestId('confidence-bar-fill');
    expect(fill.style.background).toMatch(/#b91c1c|rgb\(185, 28, 28\)/i);
  });
});

// ── T6.9: StatCard ────────────────────────────────────────────

describe('T6.9 — StatCard renders all text elements', () => {
  it('shows label, value, and subLabel', () => {
    render(
      <StatCard
        label="Total Docs"
        value={19}
        subLabel="across 8 templates"
      />,
    );
    expect(screen.getByText('Total Docs')).toBeTruthy();
    expect(screen.getByText('19')).toBeTruthy();
    expect(screen.getByText('across 8 templates')).toBeTruthy();
  });
});
