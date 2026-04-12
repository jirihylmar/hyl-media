import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CreateEntityForm } from './CreateEntityForm';

const mockCreateItem = vi.fn();
const mockNavigate = vi.fn();

vi.mock('../lib/queries', () => ({
  createItem: (...args: unknown[]) => mockCreateItem(...args),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('CreateEntityForm', () => {
  const defaultProps = {
    entityType: 'movie',
    title: 'Movie',
    fields: [
      { name: 'name', label: 'Name', required: true },
      { name: 'language', label: 'Language' },
    ],
    detailPath: '/movies',
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateItem.mockResolvedValue({ id: 'test-id', entityType: 'movie' });
  });

  it('should render the form with title and fields', () => {
    render(
      <MemoryRouter>
        <CreateEntityForm {...defaultProps} />
      </MemoryRouter>
    );
    expect(screen.getByText('New Movie')).toBeInTheDocument();
    expect(screen.getByText(/Name/)).toBeInTheDocument();
    expect(screen.getByText('Language')).toBeInTheDocument();
  });

  it('should auto-tag new entities with recommended', async () => {
    render(
      <MemoryRouter>
        <CreateEntityForm {...defaultProps} />
      </MemoryRouter>
    );

    // Get the first input (Name field)
    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: 'Test Movie' } });
    fireEvent.submit(inputs[0].closest('form')!);

    await waitFor(() => {
      expect(mockCreateItem).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'movie',
          name: 'Test Movie',
          tags: ['recommended'],
        })
      );
    });
  });

  it('should navigate to detail page after creation', async () => {
    render(
      <MemoryRouter>
        <CreateEntityForm {...defaultProps} />
      </MemoryRouter>
    );

    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: 'Test Movie' } });
    fireEvent.submit(inputs[0].closest('form')!);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.stringMatching(/^\/movies\//)
      );
    });
  });

  it('should call onCancel when Cancel is clicked', () => {
    render(
      <MemoryRouter>
        <CreateEntityForm {...defaultProps} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Cancel'));
    expect(defaultProps.onCancel).toHaveBeenCalled();
  });
});
