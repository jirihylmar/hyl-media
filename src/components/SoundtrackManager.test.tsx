import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SoundtrackManager } from './SoundtrackManager';
import { makeRecording, makeMovie, makeRecordingMovie } from '../test/mocks';

// Mock the queries module
const mockListByType = vi.fn();
const mockCreateItem = vi.fn();
const mockDeleteItem = vi.fn();

vi.mock('../lib/queries', () => ({
  listByType: (...args: unknown[]) => mockListByType(...args),
  createItem: (...args: unknown[]) => mockCreateItem(...args),
  deleteItem: (...args: unknown[]) => mockDeleteItem(...args),
}));

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('SoundtrackManager - Movie side', () => {
  const onUpdate = vi.fn();
  const soundtracks = [
    makeRecordingMovie({ id: 'link-1', recordingId: 'rec-1', recordingName: 'Song A', movieId: 'mov-1', movieName: 'Movie X' }),
    makeRecordingMovie({ id: 'link-2', recordingId: 'rec-2', recordingName: 'Song B', movieId: 'mov-1', movieName: 'Movie X' }),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render soundtrack heading with count', () => {
    renderWithRouter(
      <SoundtrackManager side="movie" movieId="mov-1" movieName="Movie X" soundtracks={soundtracks} onUpdate={onUpdate} />
    );
    expect(screen.getByText('Soundtrack (2)')).toBeInTheDocument();
  });

  it('should render links to recordings', () => {
    renderWithRouter(
      <SoundtrackManager side="movie" movieId="mov-1" movieName="Movie X" soundtracks={soundtracks} onUpdate={onUpdate} />
    );
    expect(screen.getByText('Song A')).toBeInTheDocument();
    expect(screen.getByText('Song B')).toBeInTheDocument();
    const link = screen.getByText('Song A').closest('a');
    expect(link).toHaveAttribute('href', '/recordings/rec-1');
  });

  it('should show add form when + button is clicked', () => {
    renderWithRouter(
      <SoundtrackManager side="movie" movieId="mov-1" movieName="Movie X" soundtracks={soundtracks} onUpdate={onUpdate} />
    );
    fireEvent.click(screen.getByTitle('Add recording'));
    expect(screen.getByPlaceholderText('Search recordings...')).toBeInTheDocument();
    expect(screen.getByText('Add recording to soundtrack')).toBeInTheDocument();
  });

  it('should search recordings when typing', async () => {
    mockListByType.mockResolvedValue([
      makeRecording({ id: 'rec-3', name: 'New Song' }),
      makeRecording({ id: 'rec-1', name: 'Song A' }), // Already linked, should be filtered
    ]);

    renderWithRouter(
      <SoundtrackManager side="movie" movieId="mov-1" movieName="Movie X" soundtracks={soundtracks} onUpdate={onUpdate} />
    );
    fireEvent.click(screen.getByTitle('Add recording'));
    fireEvent.change(screen.getByPlaceholderText('Search recordings...'), { target: { value: 'new' } });

    await waitFor(() => {
      expect(mockListByType).toHaveBeenCalledWith('recording');
    });
    await waitFor(() => {
      expect(screen.getByText('New Song')).toBeInTheDocument();
    });
  });

  it('should add recording when clicked in search results', async () => {
    mockListByType.mockResolvedValue([
      makeRecording({ id: 'rec-3', name: 'New Song' }),
    ]);
    mockCreateItem.mockResolvedValue(makeRecordingMovie());

    renderWithRouter(
      <SoundtrackManager side="movie" movieId="mov-1" movieName="Movie X" soundtracks={soundtracks} onUpdate={onUpdate} />
    );
    fireEvent.click(screen.getByTitle('Add recording'));
    fireEvent.change(screen.getByPlaceholderText('Search recordings...'), { target: { value: 'new' } });

    await waitFor(() => expect(screen.getByText('New Song')).toBeInTheDocument());
    fireEvent.click(screen.getByText('New Song'));

    await waitFor(() => {
      expect(mockCreateItem).toHaveBeenCalledWith(expect.objectContaining({
        entityType: 'recording_movie',
        movieId: 'mov-1',
        movieName: 'Movie X',
        recordingId: 'rec-3',
        recordingName: 'New Song',
      }));
    });
    expect(onUpdate).toHaveBeenCalled();
  });

  it('should delete soundtrack link when remove button is clicked', async () => {
    mockDeleteItem.mockResolvedValue(makeRecordingMovie());

    renderWithRouter(
      <SoundtrackManager side="movie" movieId="mov-1" movieName="Movie X" soundtracks={soundtracks} onUpdate={onUpdate} />
    );

    const removeButtons = screen.getAllByTitle('Remove');
    fireEvent.click(removeButtons[0]);

    await waitFor(() => {
      expect(mockDeleteItem).toHaveBeenCalledWith('link-1', 'recording_movie');
    });
    expect(onUpdate).toHaveBeenCalled();
  });

  it('should show empty state with 0 count', () => {
    renderWithRouter(
      <SoundtrackManager side="movie" movieId="mov-1" movieName="Movie X" soundtracks={[]} onUpdate={onUpdate} />
    );
    expect(screen.getByText('Soundtrack (0)')).toBeInTheDocument();
  });
});

describe('SoundtrackManager - Recording side', () => {
  const onUpdate = vi.fn();
  const movieLinks = [
    makeRecordingMovie({ id: 'link-1', movieId: 'mov-1', movieName: 'Movie X', recordingId: 'rec-1', recordingName: 'Song A' }),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render "Featured in" heading with count', () => {
    renderWithRouter(
      <SoundtrackManager side="recording" recordingId="rec-1" recordingName="Song A" movieLinks={movieLinks} onUpdate={onUpdate} />
    );
    expect(screen.getByText('Featured in (1)')).toBeInTheDocument();
  });

  it('should render links to movies', () => {
    renderWithRouter(
      <SoundtrackManager side="recording" recordingId="rec-1" recordingName="Song A" movieLinks={movieLinks} onUpdate={onUpdate} />
    );
    expect(screen.getByText('Movie X')).toBeInTheDocument();
    const link = screen.getByText('Movie X').closest('a');
    expect(link).toHaveAttribute('href', '/movies/mov-1');
  });

  it('should show add form for movies', () => {
    renderWithRouter(
      <SoundtrackManager side="recording" recordingId="rec-1" recordingName="Song A" movieLinks={movieLinks} onUpdate={onUpdate} />
    );
    fireEvent.click(screen.getByTitle('Add movie'));
    expect(screen.getByPlaceholderText('Search movies...')).toBeInTheDocument();
    expect(screen.getByText('Add movie')).toBeInTheDocument();
  });

  it('should search movies when typing', async () => {
    mockListByType.mockResolvedValue([
      makeMovie({ id: 'mov-2', name: 'Another Movie' }),
    ]);

    renderWithRouter(
      <SoundtrackManager side="recording" recordingId="rec-1" recordingName="Song A" movieLinks={movieLinks} onUpdate={onUpdate} />
    );
    fireEvent.click(screen.getByTitle('Add movie'));
    fireEvent.change(screen.getByPlaceholderText('Search movies...'), { target: { value: 'another' } });

    await waitFor(() => {
      expect(mockListByType).toHaveBeenCalledWith('movie');
    });
    await waitFor(() => {
      expect(screen.getByText('Another Movie')).toBeInTheDocument();
    });
  });

  it('should create recording_movie link from recording side', async () => {
    mockListByType.mockResolvedValue([
      makeMovie({ id: 'mov-2', name: 'Another Movie' }),
    ]);
    mockCreateItem.mockResolvedValue(makeRecordingMovie());

    renderWithRouter(
      <SoundtrackManager side="recording" recordingId="rec-1" recordingName="Song A" movieLinks={movieLinks} onUpdate={onUpdate} />
    );
    fireEvent.click(screen.getByTitle('Add movie'));
    fireEvent.change(screen.getByPlaceholderText('Search movies...'), { target: { value: 'another' } });

    await waitFor(() => expect(screen.getByText('Another Movie')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Another Movie'));

    await waitFor(() => {
      expect(mockCreateItem).toHaveBeenCalledWith(expect.objectContaining({
        entityType: 'recording_movie',
        movieId: 'mov-2',
        movieName: 'Another Movie',
        recordingId: 'rec-1',
        recordingName: 'Song A',
      }));
    });
    expect(onUpdate).toHaveBeenCalled();
  });
});
