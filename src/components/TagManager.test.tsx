import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TagManager } from './TagManager';

// Mock the queries and UserContext modules
const mockUpdateItem = vi.fn();

vi.mock('../lib/queries', () => ({
  updateItem: (...args: unknown[]) => mockUpdateItem(...args),
}));

vi.mock('../lib/UserContext', () => ({
  useUserId: () => 'test-user',
}));

describe('TagManager', () => {
  const onUpdate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateItem.mockResolvedValue({});
  });

  it('should render "No tags assigned" when tags are empty', () => {
    render(<TagManager id="test-1" entityType="movie" tags={[]} onUpdate={onUpdate} />);
    expect(screen.getByText('No tags assigned')).toBeInTheDocument();
  });

  it('should render existing tags as badges', () => {
    render(<TagManager id="test-1" entityType="movie" tags={['rock', 'recommended']} onUpdate={onUpdate} />);
    expect(screen.getByText('rock')).toBeInTheDocument();
    expect(screen.getByText('recommended')).toBeInTheDocument();
  });

  it('should show tag picker when + button is clicked', () => {
    render(<TagManager id="test-1" entityType="movie" tags={[]} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByText('+'));
    // Should show category headers
    expect(screen.getByText('Genre')).toBeInTheDocument();
    expect(screen.getByText('Curation')).toBeInTheDocument();
  });

  it('should show the recommended tag in the picker under Curation', () => {
    render(<TagManager id="test-1" entityType="movie" tags={[]} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByText('+'));
    // Find the curation section - recommended should be there
    expect(screen.getByText('recommended')).toBeInTheDocument();
    expect(screen.getByText('favorite')).toBeInTheDocument();
    expect(screen.getByText('hidden-gem')).toBeInTheDocument();
  });

  it('should toggle tag on when clicked in picker', async () => {
    render(<TagManager id="test-1" entityType="movie" tags={[]} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByText('+'));
    fireEvent.click(screen.getByText('recommended'));

    await waitFor(() => {
      expect(mockUpdateItem).toHaveBeenCalledWith(
        'test-1', 'movie',
        { tags: ['recommended'] },
        'test-user'
      );
    });
    expect(onUpdate).toHaveBeenCalledWith(['recommended']);
  });

  it('should toggle tag off when clicked and already active', async () => {
    render(<TagManager id="test-1" entityType="movie" tags={['rock', 'recommended']} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByText('+'));
    // Click 'rock' in the picker to toggle it off
    const pickerButtons = screen.getAllByText('rock');
    // The second 'rock' is in the picker
    fireEvent.click(pickerButtons[pickerButtons.length - 1]);

    await waitFor(() => {
      expect(mockUpdateItem).toHaveBeenCalledWith(
        'test-1', 'movie',
        { tags: ['recommended'] },
        'test-user'
      );
    });
    expect(onUpdate).toHaveBeenCalledWith(['recommended']);
  });

  it('should remove tag when x button is clicked on badge', async () => {
    render(<TagManager id="test-1" entityType="movie" tags={['rock', 'recommended']} onUpdate={onUpdate} />);
    // Find remove buttons (x characters)
    const removeButtons = screen.getAllByText('\u00d7');
    fireEvent.click(removeButtons[0]); // Remove first tag ('rock')

    await waitFor(() => {
      expect(mockUpdateItem).toHaveBeenCalledWith(
        'test-1', 'movie',
        { tags: ['recommended'] },
        'test-user'
      );
    });
    expect(onUpdate).toHaveBeenCalledWith(['recommended']);
  });
});
