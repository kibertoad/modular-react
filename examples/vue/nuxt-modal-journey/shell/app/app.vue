<template>
  <div :style="{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }">
    <NuxtPage />
    <!-- All auto-imported from components/. The modal overlays any page; the
         keep-alive holds the running instance across close; the debug span lets
         the e2e observe the Pinia persistence store. -->
    <SetupWizardModal />
    <JourneyKeepAlive />
    <JourneyStoreDebug />
  </div>
</template>
