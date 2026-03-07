# Response Time Monitoring

## Overview

The `/api/agent` endpoint now includes comprehensive response time monitoring to track query performance and identify slow queries that may approach or exceed the 30-second timeout target.

## Implementation Details

### Timing Measurement
- **Start Time**: Captured at the beginning of the POST handler using `Date.now()`
- **End Time**: Calculated after response completion or error
- **Elapsed Time**: Measured in milliseconds and converted to seconds for logging

### Logged Context

Each query logs the following information:

```typescript
{
  sessionId: string,        // Session identifier for tracking conversations
  queryLength: number,      // Length of the input query in characters
  responseLength: number,   // Length of the agent response in characters
  elapsedMs: number,        // Elapsed time in milliseconds
  elapsedSeconds: string    // Elapsed time in seconds (formatted to 2 decimals)
}
```

### Performance Thresholds

The monitoring system uses three performance levels:

1. **Normal** (< 25 seconds)
   - Log level: `console.log`
   - Message: `"[/api/agent] Query completed"`
   - Action: Standard logging for analysis

2. **Warning** (≥ 25 seconds, < 30 seconds)
   - Log level: `console.warn`
   - Message: `"[/api/agent] WARNING: Slow query approaching timeout"`
   - Action: Flags queries that are close to the timeout limit

3. **Critical** (≥ 30 seconds)
   - Log level: `console.error`
   - Message: `"[/api/agent] CRITICAL: Query exceeded 30-second timeout"`
   - Action: Identifies queries that have exceeded the target completion time

### Error Handling

Response time is also logged when errors occur, providing visibility into:
- How long the request ran before failing
- The session and query context at the time of failure
- The error message for debugging

## Usage

### Monitoring Logs

To monitor query performance in production:

```bash
# View all query logs
grep "\[/api/agent\]" logs.txt

# View only slow queries (warnings and errors)
grep -E "WARNING|CRITICAL" logs.txt | grep "\[/api/agent\]"

# View queries by session
grep "sessionId.*surgeshield-1234567890" logs.txt
```

### Example Log Output

**Normal Query:**
```
[/api/agent] Query completed {
  sessionId: 'surgeshield-1704123456789',
  queryLength: 45,
  responseLength: 523,
  elapsedMs: 2341,
  elapsedSeconds: '2.34'
}
```

**Slow Query Warning:**
```
[/api/agent] WARNING: Slow query approaching timeout {
  sessionId: 'surgeshield-1704123456789',
  queryLength: 120,
  responseLength: 1847,
  elapsedMs: 27500,
  elapsedSeconds: '27.50'
}
```

**Critical Timeout:**
```
[/api/agent] CRITICAL: Query exceeded 30-second timeout {
  sessionId: 'surgeshield-1704123456789',
  queryLength: 95,
  responseLength: 2103,
  elapsedMs: 31200,
  elapsedSeconds: '31.20'
}
```

## Optimization Opportunities

When slow queries are identified, consider:

1. **Query Complexity**: Long or complex queries may require more processing time
2. **Data Retrieval**: S3 data fetching may be slow; consider caching strategies
3. **Agent Configuration**: Review Bedrock Agent settings and action group performance
4. **Network Latency**: Check AWS region configuration and network connectivity
5. **Concurrent Load**: High concurrent request volume may impact response times

## Requirements Validation

This implementation satisfies:
- **Requirement 1.1**: Verifies 30-second completion target
- **Requirement 11.5**: Optimizes response generation to complete within 30 seconds

## Security Considerations

The monitoring logs do **not** include:
- Actual query content (to protect sensitive information)
- Agent response content (to protect sensitive information)
- AWS credentials or configuration details

Only metadata (lengths, timing, session IDs) is logged for performance analysis.
