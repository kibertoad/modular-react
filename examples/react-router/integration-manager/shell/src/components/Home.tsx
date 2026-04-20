export function Home() {
  return (
    <div>
      <h1>Integration Manager example</h1>
      <p>
        Pick an integration from the sidebar. All three render the same screen, driven by config.
      </p>
      <ul>
        <li>
          <strong>Contentful</strong> — shows language/folder assignment and import-tag metadata.
        </li>
        <li>
          <strong>Strapi</strong> — base-language import limit, batch size 50.
        </li>
        <li>
          <strong>GitHub</strong> — file-path columns, batch size 200, no import tags.
        </li>
      </ul>
      <p>
        Notice the header adapts: buttons appear and disappear based on which feature flags the
        active integration declares. The shell never branches on integration id — it reads typed
        flags via <code>useRouteData&lt;AppRouteData&gt;()</code>.
      </p>
    </div>
  );
}
