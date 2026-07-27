// Copy this file to `js/config.js` and fill in your values.
// `js/config.js` is gitignored so your resource IDs stay out of version
// control. (Cognito Pool/Client IDs and the AppSync endpoint are embedded in
// any client app and are not secrets, but keeping them uncommitted avoids
// baking environment-specific values into the repo.)
//
// Behaviour is progressive:
//   - Leave everything blank  -> app runs on localStorage, no login (today's behaviour).
//   - Fill userPoolId + userPoolClientId -> the email/password login gate turns on.
//   - Also fill appsync.endpoint -> data persistence switches to AppSync/DynamoDB.

export default {
  // Your existing Cognito user pool (reused for this app's login).
  region: 'us-east-1',
  userPoolId: 'us-east-1_iQ2q3z7ep',            // e.g. 'us-east-1_ABC123DEF'
  userPoolClientId: '1kebmtlgnvlb1taim1eapd0nav',      // an app client WITHOUT a client secret (public web client)

  // The AppSync GraphQL API for minute-book data. Provision with the Amplify
  // CLI using schema/schema.graphql and Cognito user-pool auth (see README),
  // then paste the endpoint here.
  appsync: {
    endpoint: '',            // e.g. 'https://xxxx.appsync-api.us-east-1.amazonaws.com/graphql'
    region: 'us-east-1',
  },
};
