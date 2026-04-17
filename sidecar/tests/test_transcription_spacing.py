from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.transcription import _tokens_to_words


def test_tokens_to_words_adds_leading_spaces_for_non_first_words() -> None:
    tokens = [" hello", " world", ",", " again"]
    timestamps = [0.0, 0.3, 0.5, 0.7]

    words = _tokens_to_words(tokens, timestamps, segment_id=0, word_id_start=0)
    rendered = ''.join(w['word'] for w in words)

    assert rendered == 'hello world, again'


def test_tokens_to_words_sentencepiece_spacing() -> None:
    tokens = ["▁hello", "▁world"]
    timestamps = [0.0, 0.5]

    words = _tokens_to_words(tokens, timestamps, segment_id=0, word_id_start=0)
    rendered = ''.join(w['word'] for w in words)

    assert rendered == 'hello world'


def test_tokens_to_words_bpe_subword_stream() -> None:
    tokens = [" A", "ch", ",", " keine", " A", "hn", "ung", ",", " wie", " man", " dam", "it"]
    timestamps = [1.28, 1.6, 1.76, 1.84, 2.16, 2.24, 2.32, 2.4, 2.48, 2.64, 2.8, 2.96]

    words = _tokens_to_words(tokens, timestamps, segment_id=0, word_id_start=0)
    rendered = ''.join(w['word'] for w in words)

    assert rendered == 'Ach, keine Ahnung, wie man damit'
