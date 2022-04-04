<script setup lang="ts">
import { ref } from 'vue'
const t0 = ref(0)
const X = ref(30)
const sharedSecret = ref('totp0123456789')
const digits = ref(10)
const hashAlgorithm = ref('HmacSHA1')
const timestamp = ref(Math.round(Date.now() / 1000))
const password = ref('0')

function refreshTimestamp() {
  timestamp.value = Math.round(Date.now() / 1000)
}

async function fetchRemote() {
  console.log('fetching remote data')
  console.log(t0.value)
  console.log(X.value)
  console.log(sharedSecret.value)
  console.log(digits.value)
  console.log(hashAlgorithm.value)
  console.log(timestamp.value)
  // const url: string = 'http://localhost:7071/api/TOTPGenerator'
  const url: string = 'https://totpfast.azurewebsites.net/api/TOTPGenerator'
  const server = new URL(url)
  const params = [
    ["code", "V4E3yvUMwDz7UbzaZ8LdPpJMa6SkbgD0dXHLCFsfJgxNps12ZIJppQ=="],
    ["T0", `${t0.value}`],
    ["X", `${X.value}`],
    ["sharedSecret", `${sharedSecret.value}`],
    ["digits", `${digits.value}`],
    ["hashAlgorithm", `${hashAlgorithm.value}`],
    ["timestamp", `${timestamp.value}`],
  ]
  server.search = new URLSearchParams(params).toString();
  console.log(server)
  console.log(server.toString())
  const response = await fetch(server.toString())
  console.log(response)
  if (response.ok) {
    if (response.body) {
      response.text().then(text => {
        console.log(text)
        password.value = text
      })
    }
  }
}
</script>

<template>
  <header>
    <h1>Online TOTP Generator</h1>
  </header>

  <main>
    <form @submit.prevent>
      <div class="form-example">
        <label for="T0">T0 (Initial time)</label>
        <input id="T0" v-model="t0" placeholder="0" />
      </div>
      <div class="form-example">
        <label for="X">X (Time step)</label>
        <input id="X" v-model="X" placeholder="30" />
      </div>
      <div class="form-example">
        <label for="sharedSecret">sharedSecret</label>
        <input id="sharedSecret" v-model="sharedSecret" placeholder="totp0123456789" />
      </div>
      <div class="form-example">
        <label for="digits">digits</label>
        <input id="digits" v-model="digits" placeholder="10" />
      </div>
      <div class="form-example">
        <label for="hashAlgorithm">hashAlgorithm</label>
        <select v-model="hashAlgorithm">
          <option disabled value>Please select one</option>
          <option>HmacSHA1</option>
          <option>HmacSHA256</option>
          <option>HmacSHA512</option>
        </select>
      </div>
      <div class="form-example">
        <label for="timestamp">timestamp</label>
        <input id="timestamp" v-model="timestamp" />
        <button v-on:click="refreshTimestamp">Now</button>
      </div>
      <div class="form-example">
        <input type="submit" value="Generate!" v-on:click="fetchRemote" />
      </div>
    </form>
    <div class="result">
      <h2>TOTP password: <div class="result-content">{{ password }}</div></h2>
    </div>
    <p>
      How to use it in CURL:
      <br>
      curl https://totpfast.azurewebsites.net/api/TOTPGenerator?code=V4E3yvUMwDz7UbzaZ8LdPpJMa6SkbgD0dXHLCFsfJgxNps12ZIJppQ==&T0=0&X=30&sharedSecret=1234567890&digits=10&hashAlgorithm=HmacSHA512&timestamp=1648039295
    </p>
  </main>
</template>

<style>
@import "./assets/base.css";

#app {
  max-width: 1280px;
  margin: 0 auto;
  padding: 2rem;

  font-weight: normal;
}

header {
  line-height: 1.5;
}

.logo {
  display: block;
  margin: 0 auto 2rem;
}

a,
.green {
  text-decoration: none;
  color: hsla(160, 100%, 37%, 1);
  transition: 0.4s;
}

@media (hover: hover) {
  a:hover {
    background-color: hsla(160, 100%, 37%, 0.2);
  }
}

@media (min-width: 1024px) {
  body {
    display: flex;
    place-items: center;
  }

  #app {
    display: grid;
    grid-template-columns: 1fr 1fr;
    padding: 0 2rem;
  }

  header {
    display: flex;
    place-items: center;
    padding-right: calc(var(--section-gap) / 2);
  }

  header .wrapper {
    display: flex;
    place-items: flex-start;
    flex-wrap: wrap;
  }

  .logo {
    margin: 0 2rem 0 0;
  }
}

form.form-example {
  display: table;
}

div.form-example {
  display: table-example;
}

label,
input {
  display: table-cell;
  margin-bottom: 10px;
}

label {
  padding-right: 10px;
}

.result-content {
  color: red;
}
</style>
