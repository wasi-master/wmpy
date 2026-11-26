"""Checks plugin.schema.json: every manifest under tests/good passes, every one under tests/bad fails, and the
plugin.json files of other tools under tests/foreign pass untouched.

    python3 editors/schemas/test_schema.py   (needs: pip install jsonschema)
"""
import json
import pathlib
import sys

import jsonschema

HERE = pathlib.Path(__file__).parent
schema = json.loads((HERE / "plugin.schema.json").read_text())
jsonschema.Draft7Validator.check_schema(schema)
validator = jsonschema.Draft7Validator(schema)

failed = 0
for kind in ("good", "bad", "foreign"):
    for path in sorted((HERE / "tests" / kind).glob("*.json")):
        errors = list(validator.iter_errors(json.loads(path.read_text())))
        if (kind != "bad") != (not errors):
            failed += 1
            why = "; ".join(e.message for e in errors[:3]) or "no errors"
            print(f"FAIL {kind}/{path.name}: {why}")
        else:
            print(f"ok   {kind}/{path.name}")
print(f"{failed} failed")
sys.exit(1 if failed else 0)
