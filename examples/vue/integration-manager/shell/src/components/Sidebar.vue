<script setup lang="ts">
import { RouterLink } from "vue-router";
import { useNavigation } from "@modular-vue/vue";

// `useNavigation()` returns the resolved navigation manifest — a plain value
// (it is set once at resolve time, so it is not wrapped in a ref). The manifest
// groups the module-contributed nav items; the shell owns how they render.
const manifest = useNavigation();
</script>

<template>
  <nav :style="{ borderRight: '1px solid #e5e5e5', padding: '16px' }">
    <RouterLink to="/" :style="{ fontWeight: 600, display: 'block', marginBottom: '16px' }">
      Home
    </RouterLink>
    <section v-for="group in manifest.groups" :key="group.group" :style="{ marginBottom: '16px' }">
      <h3
        :style="{
          fontSize: '11px',
          textTransform: 'uppercase',
          color: '#888',
          margin: '0 0 6px',
        }"
      >
        {{ group.group }}
      </h3>
      <ul :style="{ listStyle: 'none', padding: 0, margin: 0 }">
        <!--
          This example uses the default NavigationItem context (`void`), so
          `item.to` is always a string. If you adopt function-form hrefs
          (NavigationItem<TLabel, TContext> with TContext !== void), resolve
          `item.to(context)` here instead of falling back to "#".
        -->
        <li v-for="item in group.items" :key="`${group.group}:${item.label}:${String(item.to)}`">
          <RouterLink :to="typeof item.to === 'string' ? item.to : '#'">
            {{ item.label }}
          </RouterLink>
        </li>
      </ul>
    </section>
  </nav>
</template>
