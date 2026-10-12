from std.collections import Dict
from std.os.path import exists
from std.pathlib import Path
from std.sys import argv
from std.time import perf_counter_ns


def main() raises:
    var started = perf_counter_ns()
    var words = "the standard library runs in dolly".split(" ")
    var lengths = List[Int]()
    var counts = Dict[String, Int]()
    for word in words:
        lengths.append(word.byte_length())
        counts[String(word)] = word.byte_length()
    var total = 0
    for length in lengths:
        total += length
    var path = Path("/tmp/mojo-library.txt")
    path.write_text(String(total))
    print(
        "MOJO-LIBRARY",
        len(words),
        counts["dolly"],
        path.read_text(),
        exists(path),
        len(argv()),
        Float64(total) / 4,
        perf_counter_ns() >= started,
    )
