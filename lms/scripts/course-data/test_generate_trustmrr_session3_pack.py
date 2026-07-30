import unittest

from generate_trustmrr_session3_pack import select_representative_sample


class RepresentativeSampleTest(unittest.TestCase):
    def test_accepts_a_source_without_zero_asking_prices(self) -> None:
        rows = []
        mrr_values = ["0", "10", "100", "1000", "10000", "100000"]
        for band_index, mrr in enumerate(mrr_values):
            for offset in range(6):
                row_number = 2 + band_index * 6 + offset
                rows.append(
                    {
                        "record_id": f"record-{row_number}",
                        "source_row_number": str(row_number),
                        "mrr_usd": mrr,
                        "on_sale": "true" if offset % 2 == 0 else "false",
                        "visitors_30d": ["", "0", "10"][offset % 3],
                        "asking_price_usd": "" if offset % 2 == 0 else "500",
                        "country": "" if offset == 0 else "IN",
                        "category": "" if offset == 1 else "AI",
                        "revenue_30d_usd": "0" if offset == 2 else "100",
                        "mrr_growth_30d_pct": ["", "-1", "2"][offset % 3],
                    }
                )

        selected = select_representative_sample(rows)

        self.assertEqual(36, len(selected))


if __name__ == "__main__":
    unittest.main()
