"""Registration/failure safety tests; these fixtures require only Python's standard library."""
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from extract_artwork import assembly_pad, extract, register_holes


class RegistrationTests(unittest.TestCase):
    def setUp(self):
        self.front = [{'x': 2.1 + (i % 16) * 4.7, 'z': 3.2 + (i // 16) * 4.1} for i in range(219)]
        self.back = [(92 - h['x'], h['z']) for h in self.front]

    def test_mirrored_centers_form_a_bijection(self):
        result = register_holes(self.front, list(reversed(self.back)))
        self.assertEqual(result['matchedCenters'], 219)
        self.assertLess(result['maxErrorMm'], 0.000001)

    def test_missing_mirror_is_rejected(self):
        raw = [(h['x'], h['z']) for h in self.front]
        with self.assertRaisesRegex(ValueError, 'registration'):
            register_holes(self.front, raw)

    def test_duplicate_front_cannot_reuse_one_back_center(self):
        self.front[-1] = dict(self.front[0])
        with self.assertRaisesRegex(ValueError, 'uniquely'):
            register_holes(self.front, self.back)

    def test_missing_symbols_and_shifted_frame_are_rejected(self):
        with self.assertRaisesRegex(ValueError, 'pad symbols'):
            register_holes(self.front[:-1], self.back)
        shifted = [(x + 0.4, z) for x, z in self.back]
        with self.assertRaisesRegex(ValueError, 'registration'):
            register_holes(self.front, shifted)

    def test_oblong_and_square_pads_are_not_dropped_or_promoted_to_drill_slots(self):
        def drawing(commands, w, d):
            rect = SimpleNamespace(x0=0, y0=0, x1=w, y1=d, width=w, height=d)
            return {'type': 'f', 'items': [(c,) for c in commands], 'rect': rect}
        oval = assembly_pad(drawing(['c', 'c', 'l', 'c', 'c'], 2.88, 3.6), (0, 0))
        self.assertEqual(oval['shape'], 'oval')
        self.assertGreater(oval['padDepth'], oval['padWidth'])
        self.assertNotIn('drillShape', oval)
        self.assertEqual(assembly_pad(drawing(['re'], 4.44, 4.5), (0, 0))['shape'], 'square')
        self.assertIsNone(assembly_pad(drawing(['re'], 15.12, 25.56), (0, 0)))

    def test_invalid_source_does_not_replace_previous_assets(self):
        class EmptyDocument:
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
            def __getitem__(self, index):
                return SimpleNamespace(get_drawings=lambda: [])

        with tempfile.TemporaryDirectory(prefix='stcb-artwork-test-') as directory:
            directory = Path(directory).resolve()
            self.assertTrue(directory.is_relative_to(Path(tempfile.gettempdir()).resolve()))
            pdf = directory / 'invalid.pdf'
            pdf.write_bytes(b'fixture handled by the fake PDF reader')
            output = directory / 'assets'
            output.mkdir()
            previous = {'front-silk.svg': b'previous front', 'manifest.json': b'previous manifest'}
            for name, payload in previous.items():
                (output / name).write_bytes(payload)
            with patch.dict(sys.modules, {'fitz': SimpleNamespace(open=lambda path: EmptyDocument())}):
                with self.assertRaisesRegex(ValueError, 'registration'):
                    extract(pdf, output)
            self.assertEqual({p.name: p.read_bytes() for p in output.iterdir()}, previous)


if __name__ == '__main__':
    unittest.main()
