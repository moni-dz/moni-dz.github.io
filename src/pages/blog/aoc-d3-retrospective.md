---
layout: ../../layouts/BlogLayout.astro
title: "AoC 2025 Day 3: When SIMD Makes Sense"
date: 2024-12-18T00:00:00.000Z
description: "A retrospective on using SIMD to find the largest N digits in a battery joltage sequence"
---

## The Problem

[Day 3](https://adventofcode.com/2025/day/3) was deceptively simple: given a grid of single digits representing battery joltage ratings, find the largest possible $n$-digit number ($n = 2$ for part 1, $n = 12$ for part 2) you can make per row, then sum them all up.

For example, in the row `987654321111111`, the answer is **98** (turn on the first two batteries).

Part 2 asks the same question but for selecting the 12 largest digits instead of $n = 2$. From `987654321111111`, that would be `987654321111`.

## Original sequential solution

Before I reached for `portable_simd`, I wrote a straightforward, idiomatic Rust solution:

```rust
fn max_joltage<const N: usize>(bytes: &[u8]) -> u64 {
    if N == 2 {
        bytes[..bytes.len() - 1]
            .iter()
            .rev()
            .fold((0u64, bytes[bytes.len() - 1]), |(max_val, max_seen), x| {
                let x = *x;
                let candidate = (x - b'0') as u64 * 10 + (max_seen - b'0') as u64;
                (max_val.max(candidate), max_seen.max(x))
            })
            .0
    } else {
        let (result, _, _) = (0..N).fold(
            (0u64, 0usize, bytes.len() - N),
            |(result, start, end), _| {
                let max_char = *bytes[start..=end].iter().max().unwrap();
                let max_idx = start
                    + bytes[start..=end]
                        .iter()
                        .position(|&b| b == max_char)
                        .unwrap();
                (result * 10 + (max_char - b'0') as u64, max_idx + 1, end + 1)
            },
        );
        result
    }
}
```

Part 1 uses a reverse iteration trick, as you scan right-to-left, you track the maximum value seen so far, which becomes your second digit. Part 2 iteratively finds the max, locks it in, and repeats.

## Time Complexity

After submitting this solution, I realized that finding $n$ maximums sequentially was slow for $n=12$. The original solution calls `.iter().max()` $n$ times per row, which is $\text{O}(100n) = \text{O}(1200)$ byte comparisons per row for the input.

### SIMD vs sequential for one iteration

Using the first 32 bytes of our input string, here's what happens in a single loop iteration for SIMD:

<style>
  .simd-op {
    margin: 2rem 0 1.5rem 0;
    padding: 1rem;
    background-color: rgba(var(--bg-accent), 0.5);
    border-left: 3px solid var(--link-color);
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  @media (max-width: 640px) {
    .simd-op {
      margin: 1.5rem 0 1rem 0;
      padding: 0.75rem;
    }
  }

  .simd-op-title {
    font-size: 0.875rem;
    color: var(--abbr-color);
    font-family: monospace;
    font-weight: 600;
    margin-bottom: 1rem;
  }

  .simd-bytes {
    display: flex;
    gap: 0;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
    align-items: center;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .simd-byte {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    font-size: 10px;
    font-weight: 600;
    border: 1px solid var(--border-color);
    background-color: var(--bg-color);
    color: var(--text-color);
    font-family: monospace;
    flex-shrink: 0;
  }

  @media (max-width: 640px) {
    .simd-byte {
      width: 20px;
      height: 20px;
      font-size: 8px;
    }
  }

  .simd-byte.max {
    background-color: var(--link-color);
    color: var(--bg-color);
    border-color: var(--link-color);
  }

  .simd-byte.match {
    background: linear-gradient(45deg, transparent 48%, var(--link-color) 48%, var(--link-color) 52%, transparent 52%),
                linear-gradient(-45deg, transparent 48%, var(--link-color) 48%, var(--link-color) 52%, transparent 52%);
    background-size: 4px 4px;
    color: var(--text-color);
    border: 1px solid var(--border-color);
    position: relative;
    z-index: 1;
    text-shadow: 
      -2px -2px 0 var(--bg-color), -1px -2px 0 var(--bg-color), 0px -2px 0 var(--bg-color), 1px -2px 0 var(--bg-color), 2px -2px 0 var(--bg-color),
      -2px -1px 0 var(--bg-color), 2px -1px 0 var(--bg-color),
      -2px 0px 0 var(--bg-color), 2px 0px 0 var(--bg-color),
      -2px 1px 0 var(--bg-color), 2px 1px 0 var(--bg-color),
      -2px 2px 0 var(--bg-color), -1px 2px 0 var(--bg-color), 0px 2px 0 var(--bg-color), 1px 2px 0 var(--bg-color), 2px 2px 0 var(--bg-color);
  }
  
  .simd-byte.match::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(45deg, transparent 48%, var(--link-color) 48%, var(--link-color) 52%, transparent 52%),
                linear-gradient(-45deg, transparent 48%, var(--link-color) 48%, var(--link-color) 52%, transparent 52%);
    background-size: 4px 4px;
    pointer-events: none;
    z-index: -1;
  }

  .simd-step-desc {
    font-size: 0.8rem;
    color: var(--abbr-color);
    font-family: monospace;
    margin-top: 0.5rem;
  }
</style>

<div style="margin: 2rem 0;">
  <div class="simd-op">
    <div class="simd-op-title"><code>Simd::from_slice(&bytes[j..j + 32])</code></div>
    <div class="simd-bytes">
      <span class="simd-byte">6</span>
      <span class="simd-byte">8</span>
      <span class="simd-byte">3</span>
      <span class="simd-byte max">9</span>
      <span class="simd-byte">1</span>
      <span class="simd-byte">5</span>
      <span class="simd-byte">3</span>
      <span class="simd-byte">3</span>
      <span class="simd-byte">5</span>
      <span class="simd-byte">3</span>
      <span class="simd-byte">2</span>
      <span class="simd-byte">4</span>
      <span class="simd-byte">2</span>
      <span class="simd-byte">3</span>
      <span class="simd-byte">2</span>
      <span class="simd-byte">4</span>
      <span class="simd-byte">1</span>
      <span class="simd-byte">4</span>
      <span class="simd-byte">3</span>
      <span class="simd-byte">2</span>
      <span class="simd-byte">7</span>
      <span class="simd-byte">1</span>
      <span class="simd-byte">1</span>
      <span class="simd-byte">8</span>
      <span class="simd-byte">4</span>
      <span class="simd-byte">2</span>
      <span class="simd-byte">4</span>
      <span class="simd-byte">5</span>
      <span class="simd-byte">1</span>
      <span class="simd-byte">5</span>
      <span class="simd-byte">4</span>
      <span class="simd-byte">3</span>
    </div>
    <div class="simd-step-desc">chunk: u8x32 = [6,8,3,9,1,5,3,3,5,3,2,4,2,3,2,4,1,4,3,2,7,1,1,8,4,2,4,5,1,5,4,3]</div>
  </div>

  <div class="simd-op">
    <div class="simd-op-title"><code>chunk.reduce_max()</code></div>
    <div class="simd-bytes">
      <span class="simd-byte max">9</span>
    </div>
    <div class="simd-step-desc">chunk_max: u8 = 9</div>
  </div>

  <div class="simd-op">
    <div class="simd-op-title"><code>Simd::splat(chunk_max)</code></div>
    <div class="simd-bytes">
      <span class="simd-byte max">9</span>
      <span class="simd-byte max">9</span>
      <span class="simd-byte max">9</span>
      <span class="simd-byte max">9</span>
      <span class="simd-byte max">9</span>
      <span class="simd-byte max">9</span>
      <span class="simd-byte max">9</span>
      <span class="simd-byte max">9</span>
      <span class="simd-byte max">9</span>
      <span class="simd-byte max">9</span>
      <span class="simd-byte max">9</span>
      <span class="simd-byte max">9</span>
      <span class="simd-byte max">9</span>
      <span class="simd-byte max">9</span>
      <span class="simd-byte max">9</span>
      <span class="simd-byte max">9</span>
      <span class="simd-byte max">9</span>
      <span class="simd-byte max">9</span>
      <span class="simd-byte max">9</span>
      <span class="simd-byte max">9</span>
      <span class="simd-byte max">9</span>
      <span class="simd-byte max">9</span>
      <span class="simd-byte max">9</span>
      <span class="simd-byte max">9</span>
      <span class="simd-byte max">9</span>
      <span class="simd-byte max">9</span>
      <span class="simd-byte max">9</span>
      <span class="simd-byte max">9</span>
      <span class="simd-byte max">9</span>
      <span class="simd-byte max">9</span>
      <span class="simd-byte max">9</span>
      <span class="simd-byte max">9</span>
    </div>
    <div class="simd-step-desc">target: u8x32 = Simd::splat(9) → replicate 9 across all 32 positions</div>
  </div>

  <!-- Step 4: simd_eq comparison -->
  <div class="simd-op">
    <div class="simd-op-title"><code>chunk.simd_eq(target)</code></div>
    <div class="simd-bytes">
      <span class="simd-byte" style="background-color: rgba(var(--border-color), 0.2);">F</span>
      <span class="simd-byte" style="background-color: rgba(var(--border-color), 0.2);">F</span>
      <span class="simd-byte" style="background-color: rgba(var(--border-color), 0.2);">F</span>
      <span class="simd-byte match">T</span>
      <span class="simd-byte" style="background-color: rgba(var(--border-color), 0.2);">F</span>
      <span class="simd-byte" style="background-color: rgba(var(--border-color), 0.2);">F</span>
      <span class="simd-byte" style="background-color: rgba(var(--border-color), 0.2);">F</span>
      <span class="simd-byte" style="background-color: rgba(var(--border-color), 0.2);">F</span>
      <span class="simd-byte" style="background-color: rgba(var(--border-color), 0.2);">F</span>
      <span class="simd-byte" style="background-color: rgba(var(--border-color), 0.2);">F</span>
      <span class="simd-byte" style="background-color: rgba(var(--border-color), 0.2);">F</span>
      <span class="simd-byte" style="background-color: rgba(var(--border-color), 0.2);">F</span>
      <span class="simd-byte" style="background-color: rgba(var(--border-color), 0.2);">F</span>
      <span class="simd-byte" style="background-color: rgba(var(--border-color), 0.2);">F</span>
      <span class="simd-byte" style="background-color: rgba(var(--border-color), 0.2);">F</span>
      <span class="simd-byte" style="background-color: rgba(var(--border-color), 0.2);">F</span>
      <span class="simd-byte" style="background-color: rgba(var(--border-color), 0.2);">F</span>
      <span class="simd-byte" style="background-color: rgba(var(--border-color), 0.2);">F</span>
      <span class="simd-byte" style="background-color: rgba(var(--border-color), 0.2);">F</span>
      <span class="simd-byte" style="background-color: rgba(var(--border-color), 0.2);">F</span>
      <span class="simd-byte" style="background-color: rgba(var(--border-color), 0.2);">F</span>
      <span class="simd-byte" style="background-color: rgba(var(--border-color), 0.2);">F</span>
      <span class="simd-byte" style="background-color: rgba(var(--border-color), 0.2);">F</span>
      <span class="simd-byte" style="background-color: rgba(var(--border-color), 0.2);">F</span>
      <span class="simd-byte" style="background-color: rgba(var(--border-color), 0.2);">F</span>
      <span class="simd-byte" style="background-color: rgba(var(--border-color), 0.2);">F</span>
      <span class="simd-byte" style="background-color: rgba(var(--border-color), 0.2);">F</span>
      <span class="simd-byte" style="background-color: rgba(var(--border-color), 0.2);">F</span>
      <span class="simd-byte" style="background-color: rgba(var(--border-color), 0.2);">F</span>
      <span class="simd-byte" style="background-color: rgba(var(--border-color), 0.2);">F</span>
      <span class="simd-byte" style="background-color: rgba(var(--border-color), 0.2);">F</span>
      <span class="simd-byte" style="background-color: rgba(var(--border-color), 0.2);">F</span>
    </div>
  </div>

  <!-- Step 5: to_bitmask -->
  <div class="simd-op">
    <div class="simd-op-title"><code>mask.to_bitmask()</code></div>
    <div class="simd-bytes">
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte match">1</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
    </div>
  </div>

  <div class="simd-op">
    <div class="simd-op-title"><code>mask.trailing_zeros()</code></div>
    <div class="simd-bytes">
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">0</span>
      <span class="simd-byte">1</span>
      <span class="simd-byte max">0</span>
      <span class="simd-byte max">0</span>
      <span class="simd-byte max">0</span>
    </div>
    <div class="simd-step-desc">mask.trailing_zeros() = 3 (least-significant bit first)</div>
    <div class="simd-step-desc">max_pos = j + trailing_zeros() = 0 + 3 = 3</div>
    <div class="simd-step-desc">(j is the starting position in the current segment, trailing_zeros() is the offset to the first set bit)</div>
  </div>
</div>

For comparison, here's one iteration of the sequential approach:

<div style="margin: 2rem 0;">
  <!-- Step 1: Range setup -->
  <div class="simd-op">
    <div class="simd-op-title"><code>bytes[start..=end]</code></div>
    <div style="font-size: 0.85rem; margin-bottom: 1rem;">
      <span style="display: inline-block; background-color: rgba(var(--abbr-color), 0.1); padding: 0.5rem; border-radius: 4px; font-family: monospace;">
        Iteration 1 of 12: start=0, end=88 (search space: 89 digits)
      </span>
    </div>
    <div class="simd-bytes" style="margin-bottom: 1rem;">
      <span class="simd-byte">6</span>
      <span class="simd-byte">8</span>
      <span class="simd-byte">3</span>
      <span class="simd-byte max">9</span>
      <span class="simd-byte">1</span>
      <span class="simd-byte">5</span>
      <span class="simd-byte">3</span>
      <span class="simd-byte">3</span>
      <span class="simd-byte">5</span>
      <span class="simd-byte">3</span>
      <span class="simd-byte" style="opacity: 0.3; margin-right: 0.25rem;">⋯</span>
      <span class="simd-byte">2</span>
      <span class="simd-byte">2</span>
      <span class="simd-byte">1</span>
      <span class="simd-byte">3</span>
      <span class="simd-byte">8</span>
    </div>
    <div class="simd-step-desc" style="margin-top: 0.5rem;">89 digits total: bytes 0-88 (showing first 10 and last 5)</div>
    <div class="simd-step-desc">Entire range [0..=88] must be scanned to find the maximum</div>
  </div>

  <!-- Step 2: Linear scan for max -->
  <div class="simd-op">
    <div class="simd-op-title"><code>.iter().max().unwrap()</code></div>
    <div class="simd-bytes" style="margin-bottom: 0.5rem;">
      <span class="simd-byte">6</span>
      <span class="simd-byte">8</span>
      <span class="simd-byte">3</span>
      <span class="simd-byte max">9</span>
      <span class="simd-byte" style="opacity: 0.4;">...</span>
    </div>
    <div class="simd-step-desc">Iterate through all 89 bytes, keeping track of the maximum</div>
  </div>
</div>

Modern CPUs can load 32 bytes or more into a SIMD register and compare all of them in one instruction. Instead of 100+ sequential iterations, we could do ~3 chunk comparisons per find operation. The appeal was obvious, reducing the search to ~3 chunk operations per digit, which is $\text{O}(3n) = \text{O}(36)$ byte comparisons per row.

## SIMD solution

```rust
macro_rules! chunk_max {
    ($bytes:expr, $j:expr, $end:expr, $size:expr, $simd_type:ty, $max_char:expr, $max_pos:expr) => {
        while $j + $size <= $end {
            let chunk: $simd_type =
                Simd::from_slice(unsafe { $bytes.get_unchecked($j..$j + $size) });
            let chunk_max = chunk.reduce_max();

            if chunk_max > $max_char {
                $max_char = chunk_max;
                let target: $simd_type = Simd::splat(chunk_max);
                let mask = chunk.simd_eq(target).to_bitmask();
                $max_pos = $j + mask.trailing_zeros() as usize;
            }

            $j += $size;
        }
    };
}

macro_rules! find_max_digit {
    ($bytes:expr, $range_len:expr, $start:expr, $end:expr) => {{
        let mut max_char = 0u8;
        let mut max_pos = $start;
        let mut j = $start;

        #[cfg(any(target_feature = "avx512bw", target_feature = "avx512vl"))]
        {
            if $range_len >= 64 {
                chunk_max!($bytes, j, $end, 64, u8x64, max_char, max_pos);
            }
        }

        if $range_len >= 32 && j + 32 <= $end {
            chunk_max!($bytes, j, $end, 32, u8x32, max_char, max_pos);
        }

        if $range_len >= 4 && j + 4 <= $end {
            chunk_max!($bytes, j, $end, 4, u8x4, max_char, max_pos);
        }

        for k in j..=$end {
            let b = unsafe { *$bytes.get_unchecked(k) };
            if b > max_char {
                max_char = b;
                max_pos = k;
            }
        }

        (max_char, max_pos)
    }};
}

fn max_joltage<const N: usize>(bytes: &[u8]) -> u64 {
    let len = bytes.len();

    if N == 2 {
        let (first, first_pos) = find_max_digit!(bytes, len, 0, len - 2);

        let second = {
            let (max_digit, _) =
                find_max_digit!(bytes, len - first_pos - 1, first_pos + 1, len - 1);
            max_digit
        };

        (first - b'0') as u64 * 10 + (second - b'0') as u64
    } else {
        let mut result = 0u64;
        let mut start = 0usize;
        let mut end = len - N;

        for _ in 0..N {
            let range_len = end - start + 1;

            let (max_char, max_idx) = find_max_digit!(bytes, range_len, start, end);

            result = result * 10 + (max_char - b'0') as u64;
            start = max_idx + 1;
            end += 1;
        }

        result
    }
}
```

## Benchmarks

<style>
  .benchmark-table {
    border-collapse: collapse;
    margin: 1.5rem 0;
    font-size: 0.95rem;
    width: 100%;
    overflow-x: auto;
    display: block;
  }
  
  .benchmark-table th,
  .benchmark-table td {
    border: 1px solid var(--border-color);
    padding: 0.75rem 1rem;
    text-align: right;
    white-space: nowrap;
  }
  
  .benchmark-table th {
    background-color: rgba(var(--link-color), 0.1);
    font-weight: 600;
    text-align: center;
  }
  
  .benchmark-table td:first-child {
    text-align: left;
  }

  @media (max-width: 640px) {
    .benchmark-table {
      font-size: 0.85rem;
    }

    .benchmark-table th,
    .benchmark-table td {
      padding: 0.5rem 0.75rem;
    }
  }
</style>

<table class="benchmark-table">
  <thead>
    <tr>
      <th>Approach</th>
      <th>Part 1</th>
      <th>Part 2</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>bytes[start..=end].iter().max()</code></td>
      <td>14.56 µs</td>
      <td>46.32 µs</td>
    </tr>
    <tr>
      <td><code>portable_simd</code></td>
      <td>2.16 µs</td>
      <td>18.54 µs</td>
    </tr>
    <tr>
      <td><strong>difference</strong></td>
      <td><strong>6.7x</strong></td>
      <td><strong>2.5x</strong></td>
    </tr>
  </tbody>
</table>

