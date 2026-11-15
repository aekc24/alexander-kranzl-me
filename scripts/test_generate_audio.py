import runpy
from pathlib import Path
import unittest


generator = runpy.run_path(str(Path(__file__).with_name('generate-audio.py')))


class NarrationLanguageTests(unittest.TestCase):
    def voice(self, markup):
        return generator['voice_for_page'](generator['Page'](markup))

    def test_spanish_article_overrides_german_interface(self):
        self.assertEqual(self.voice('<html lang="de"><h1 class="post-title" lang="es">El pasillo</h1></html>'),
                         'es-ES-AlvaroNeural')

    def test_spanish_regional_language(self):
        self.assertEqual(self.voice('<h1 class="post-title" lang="es-ES">Historia</h1>'),
                         'es-ES-AlvaroNeural')

    def test_german_recordings_keep_their_voice(self):
        self.assertEqual(self.voice('<html lang="de"><h1 class="post-title">Der Gang</h1></html>'),
                         'de-DE-FlorianMultilingualNeural')

    def test_document_language_is_used_without_article_language(self):
        self.assertEqual(self.voice('<html lang="es"><h1 class="post-title">Historia</h1></html>'),
                         'es-ES-AlvaroNeural')

    def test_extraction_skips_unspoken_placeholders(self):
        document = generator['Page']('<h1 class="post-title">Notizen</h1>'
                                     '<div id="audio-player-root"></div>'
                                     '<div class="post-content"><p>…</p><p>Ein Text.</p><li>50 GP</li></div>')
        self.assertEqual(generator['extract'](document), ['Notizen', 'Ein Text.', '50 GP'])


class NarrationTimingTests(unittest.TestCase):
    def test_accepts_ordered_sections_inside_recording(self):
        self.assertTrue(generator['valid_timings']([
            {'text': 'Título', 'start': 0}, {'text': 'Historia', 'start': 2.5},
        ], 10))

    def test_rejects_truncated_recording(self):
        self.assertFalse(generator['valid_timings']([
            {'text': 'Título', 'start': 0}, {'text': 'Historia', 'start': 451.97},
        ], 244.224))

    def test_rejects_unordered_sections(self):
        self.assertFalse(generator['valid_timings']([
            {'text': 'Título', 'start': 5}, {'text': 'Historia', 'start': 2.5},
        ], 10))

    def test_rejects_empty_sections(self):
        self.assertFalse(generator['valid_timings']([], 10))


if __name__ == '__main__':
    unittest.main()
