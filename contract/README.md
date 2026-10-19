# API contract

`openapi.json` is blog-backend's OpenAPI document: the contract this frontend is built against.
`src/api/contract.test.ts` checks the client against it in both directions:

- every response schema in `src/api/schemas.ts` has exactly the properties (and enum values) of the
  contract's schema
- every request the client sends uses a path and method the contract has, allowed query parameters,
  and a body with the required properties and nothing extra

## Where it comes from

The backend is still being built. This copy was generated from the reference implementation that the
backend issues are verified against; blog-backend#57 makes the real backend commit the same file as
`docs/openapi.json` and guard it with a test. Once that exists, refresh this copy from it:

```bash
curl -fsSL https://raw.githubusercontent.com/E-L-R/blog-backend/main/docs/openapi.json -o contract/openapi.json
npm test -- contract
```

A failing contract test after a refresh is the point: it shows exactly which field the frontend must
adapt to. Known gaps in the current document (every property optional, success codes all shown as 200,
an internal `userId` parameter, no security requirements) are tracked in blog-backend.
