# Response Streaming Optimization

## Overview

The `/api/agent` endpoint implements optimized response streaming to efficiently decode and aggregate chunks from AWS Bedrock Agent without unnecessary buffering delays. This optimization ensures that multi-byte UTF-8 characters are handled correctly and that decoder instances are reused for better performance.

## Implementation Details

### Optimized Streaming Logic

The streaming implementation uses a single `TextDecoder` instance with the `stream: true` option to handle chunks efficiently:

```typescript
// Create a single TextDecoder instance for all chunks
const decoder = new TextDecoder("utf-8", { fatal: false });
let fullText = "";

for await (const event of response.completion ?? []) {
  if (event.chunk?.bytes) {
    // stream:true allows the decoder to buffer incomplete multi-byte sequences
    fullText += decoder.decode(event.chunk.bytes, { stream: true });
  }
}

// Final decode call with stream:false to flush any remaining buffered bytes
fullText += decoder.decode();
```

### Key Optimizations

1. **Single Decoder Instance**
   - **Before**: Created a new `TextDecoder()` for each chunk
   - **After**: Reuse a single decoder instance across all chunks
   - **Benefit**: Reduces object allocation overhead and improves performance

2. **Stream Mode for Multi-Byte Characters**
   - **Option**: `{ stream: true }` in `decoder.decode(bytes, { stream: true })`
   - **Purpose**: Handles UTF-8 characters that may be split across chunk boundaries
   - **Behavior**: Buffers incomplete multi-byte sequences until the next chunk arrives
   - **Example**: A 3-byte UTF-8 character (e.g., "€") split across two chunks will be correctly decoded

3. **Final Flush Call**
   - **Call**: `decoder.decode()` after the loop completes
   - **Purpose**: Flushes any remaining buffered bytes from the decoder
   - **Ensures**: No data is lost if the stream ends with an incomplete sequence

4. **Error Handling**
   - **Option**: `{ fatal: false }` in decoder constructor
   - **Behavior**: Replaces invalid byte sequences with the Unicode replacement character (�) instead of throwing errors
   - **Benefit**: Prevents stream processing from failing due to malformed data

### Why This Matters

#### Multi-Byte UTF-8 Character Handling

UTF-8 encodes characters using 1-4 bytes:
- ASCII characters: 1 byte (e.g., "A" = `0x41`)
- Latin extended: 2 bytes (e.g., "é" = `0xC3 0xA9`)
- Most other scripts: 3 bytes (e.g., "€" = `0xE2 0x82 0xAC`)
- Emoji and rare characters: 4 bytes (e.g., "😀" = `0xF0 0x9F 0x98 0x80`)

**Problem**: If a chunk boundary splits a multi-byte character, decoding each chunk independently will produce invalid output:

```typescript
// BAD: Without stream mode
const chunk1 = new Uint8Array([0xE2, 0x82]); // First 2 bytes of "€"
const chunk2 = new Uint8Array([0xAC]);       // Last byte of "€"

new TextDecoder().decode(chunk1); // "��" (invalid)
new TextDecoder().decode(chunk2); // "�" (invalid)

// GOOD: With stream mode
const decoder = new TextDecoder();
decoder.decode(chunk1, { stream: true }); // "" (buffered)
decoder.decode(chunk2, { stream: true }); // "€" (complete)
decoder.decode();                         // "" (flush)
```

#### Performance Impact

Creating decoder instances is relatively expensive. For a typical response with 50-100 chunks:
- **Before**: 50-100 decoder allocations
- **After**: 1 decoder allocation
- **Savings**: ~99% reduction in decoder overhead

While the absolute time saved per request may be small (microseconds), this optimization:
- Reduces garbage collection pressure
- Improves consistency in response times
- Scales better under high load

## Requirements Validation

This implementation satisfies:
- **Requirement 11.1**: Streams response chunks as they become available
- **Requirement 11.2**: Decodes byte streams into UTF-8 text correctly
- **Requirement 11.3**: Aggregates all chunks into a complete response before returning

## Testing Considerations

### Unit Test Scenarios

To validate the streaming optimization, tests should cover:

1. **Single-byte characters** (ASCII)
   - Verify standard English text is decoded correctly
   
2. **Multi-byte characters within chunks**
   - Verify characters like "é", "€", "😀" are decoded when fully contained in a chunk
   
3. **Multi-byte characters split across chunks**
   - Verify characters are correctly decoded when split at byte boundaries
   - Test 2-byte, 3-byte, and 4-byte character splits
   
4. **Empty chunks**
   - Verify empty byte arrays don't cause errors
   
5. **Invalid byte sequences**
   - Verify `fatal: false` replaces invalid sequences with � instead of throwing

### Example Test Case

```typescript
// Test: Multi-byte character split across chunks
const decoder = new TextDecoder("utf-8", { fatal: false });
let result = "";

// "Hello €" split so "€" (0xE2 0x82 0xAC) is split across chunks
const chunk1 = new Uint8Array([0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x20, 0xE2]); // "Hello " + first byte of €
const chunk2 = new Uint8Array([0x82, 0xAC]); // Last 2 bytes of €

result += decoder.decode(chunk1, { stream: true });
result += decoder.decode(chunk2, { stream: true });
result += decoder.decode(); // Flush

expect(result).toBe("Hello €");
```

## Performance Monitoring

The streaming optimization works in conjunction with the response time monitoring system (see `MONITORING.md`). Key metrics to track:

- **Response Length**: Larger responses have more chunks and benefit more from optimization
- **Elapsed Time**: Should remain consistent or improve compared to pre-optimization baseline
- **Memory Usage**: Should be lower due to reduced decoder allocations

## Future Enhancements

Potential future optimizations:

1. **Streaming to Client**: Instead of aggregating all chunks server-side, stream directly to the client for even faster perceived response times
2. **Chunk Size Analysis**: Monitor chunk sizes to identify if AWS Bedrock is sending inefficiently small chunks
3. **Compression**: Consider gzip compression for large responses to reduce network transfer time

## References

- [TextDecoder API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder)
- [UTF-8 Encoding (Wikipedia)](https://en.wikipedia.org/wiki/UTF-8)
- [AWS Bedrock Agent Runtime API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent-runtime_InvokeAgent.html)
