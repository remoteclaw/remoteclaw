package org.remoteclaw.app.gateway

import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GatewaySessionReconnectTest {
  @Test
  fun bootstrapNodePairingRequiredKeepsReconnectActive() {
    val error =
      GatewaySession.ErrorShape(
        code = "NOT_PAIRED",
        message = "pairing required",
        details =
          GatewayConnectErrorDetails(
            code = "PAIRING_REQUIRED",
            canRetryWithDeviceToken = false,
            recommendedNextStep = "wait_then_retry",
            pauseReconnect = false,
            reason = "not-paired",
          ),
      )

    assertFalse(
      shouldPauseGatewayReconnectAfterAuthFailure(
        error = error,
        hasBootstrapToken = true,
        role = "node",
        scopes = emptyList(),
        deviceTokenRetryBudgetUsed = false,
        pendingDeviceTokenRetry = false,
      ),
    )
  }

  @Test
  fun bootstrapNodePairingRequiredWithoutRetryHintPausesReconnect() {
    val error =
      GatewaySession.ErrorShape(
        code = "NOT_PAIRED",
        message = "pairing required",
        details =
          GatewayConnectErrorDetails(
            code = "PAIRING_REQUIRED",
            canRetryWithDeviceToken = false,
            recommendedNextStep = null,
            reason = "not-paired",
          ),
      )

    assertTrue(
      shouldPauseGatewayReconnectAfterAuthFailure(
        error = error,
        hasBootstrapToken = true,
        role = "node",
        scopes = emptyList(),
        deviceTokenRetryBudgetUsed = false,
        pendingDeviceTokenRetry = false,
      ),
    )
  }

  @Test
  fun nonBootstrapPairingRequiredStillPausesReconnect() {
    val error =
      GatewaySession.ErrorShape(
        code = "NOT_PAIRED",
        message = "pairing required",
        details =
          GatewayConnectErrorDetails(
            code = "PAIRING_REQUIRED",
            canRetryWithDeviceToken = false,
            recommendedNextStep = "wait_then_retry",
            reason = "not-paired",
          ),
      )

    assertTrue(
      shouldPauseGatewayReconnectAfterAuthFailure(
        error = error,
        hasBootstrapToken = false,
        role = "node",
        scopes = emptyList(),
        deviceTokenRetryBudgetUsed = false,
        pendingDeviceTokenRetry = false,
      ),
    )
  }

  @Test
  fun bootstrapRoleUpgradeStillPausesReconnect() {
    val error =
      GatewaySession.ErrorShape(
        code = "NOT_PAIRED",
        message = "pairing required",
        details =
          GatewayConnectErrorDetails(
            code = "PAIRING_REQUIRED",
            canRetryWithDeviceToken = false,
            recommendedNextStep = null,
            reason = "role-upgrade",
          ),
      )

    assertTrue(
      shouldPauseGatewayReconnectAfterAuthFailure(
        error = error,
        hasBootstrapToken = true,
        role = "node",
        scopes = emptyList(),
        deviceTokenRetryBudgetUsed = false,
        pendingDeviceTokenRetry = false,
      ),
    )
  }

  @Test
  fun pairingRequiredFailureNotifiesPauseReconnectProblem() =
    runBlocking {
      val json = Json { ignoreUnknownKeys = true }
      val connectFailure = CompletableDeferred<Pair<GatewaySession.ErrorShape, Boolean>>()
      val server =
        startGatewayServer(json = json) { webSocket, id, method ->
          if (method == "connect") {
            webSocket.send(
              """
              {"type":"res","id":"$id","ok":false,"error":{"code":"NOT_PAIRED","message":"pairing required: device approval is required","details":{"code":"PAIRING_REQUIRED","reason":"not-paired","requestId":"request-1"}}}
              """.trimIndent(),
            )
          }
        }
      val harness =
        createReconnectHarness { error, pauseReconnect ->
          connectFailure.complete(error to pauseReconnect)
        }

      try {
        connectNodeSession(harness.session, server.port)
        val (error, pauseReconnect) = withTimeout(LIFECYCLE_TEST_TIMEOUT_MS) { connectFailure.await() }

        assertEquals("PAIRING_REQUIRED", error.details?.code)
        assertEquals("not-paired", error.details?.reason)
        assertEquals("request-1", error.details?.requestId)
        assertTrue(pauseReconnect)
      } finally {
        shutdownReconnectHarness(harness, server)
      }
    }

  @Test
  fun pairingRequiredFailureDropsUnsafeRequestId() =
    runBlocking {
      val json = Json { ignoreUnknownKeys = true }
      val connectFailure = CompletableDeferred<Pair<GatewaySession.ErrorShape, Boolean>>()
      val server =
        startGatewayServer(json = json) { webSocket, id, method ->
          if (method == "connect") {
            webSocket.send(
              """
              {"type":"res","id":"$id","ok":false,"error":{"code":"NOT_PAIRED","message":"pairing required: device approval is required","details":{"code":"PAIRING_REQUIRED","reason":"not-paired","requestId":"request-1;echo unsafe"}}}
              """.trimIndent(),
            )
          }
        }
      val harness =
        createReconnectHarness { error, pauseReconnect ->
          connectFailure.complete(error to pauseReconnect)
        }

      try {
        connectNodeSession(harness.session, server.port)
        val (error, pauseReconnect) = withTimeout(LIFECYCLE_TEST_TIMEOUT_MS) { connectFailure.await() }

        assertEquals("PAIRING_REQUIRED", error.details?.code)
        assertEquals("not-paired", error.details?.reason)
        assertNull(error.details?.requestId)
        assertTrue(pauseReconnect)
      } finally {
        shutdownReconnectHarness(harness, server)
      }
    }

  private fun createReconnectHarness(
    onConnectFailure: (GatewaySession.ErrorShape, Boolean) -> Unit = { _, _ -> },
  ): ReconnectHarness {
    val app = RuntimeEnvironment.getApplication()
    val sessionJob = SupervisorJob()
    val session =
      GatewaySession(
        scope = CoroutineScope(sessionJob + Dispatchers.Default),
        identityStore = DeviceIdentityStore(app),
        deviceAuthStore = ReconnectDeviceAuthStore(),
        onConnected = {},
        onDisconnected = { _ -> },
        onConnectFailure = onConnectFailure,
        onEvent = { _, _ -> },
        onInvoke = { GatewaySession.InvokeResult.ok("""{"handled":true}""") },
      )
    return ReconnectHarness(session = session, sessionJob = sessionJob)
  }

  private suspend fun connectNodeSession(
    session: GatewaySession,
    port: Int,
  ) {
    session.connect(
      endpoint =
        GatewayEndpoint(
          stableId = "manual|127.0.0.1|$port",
          name = "test",
          host = "127.0.0.1",
          port = port,
          tlsEnabled = false,
        ),
      token = "test-token",
      bootstrapToken = null,
      password = null,
      options =
        GatewayConnectOptions(
          role = "node",
          scopes = listOf("node:invoke"),
          caps = emptyList(),
          commands = emptyList(),
          permissions = emptyMap(),
          client =
            GatewayClientInfo(
              id = "remoteclaw-android-test",
              displayName = "Android Test",
              version = "1.0.0-test",
              platform = "android",
              mode = "node",
              instanceId = "android-test-instance",
              deviceFamily = "android",
              modelIdentifier = "test",
            ),
        ),
      tls = null,
    )
  }

  private suspend fun shutdownReconnectHarness(
    harness: ReconnectHarness,
    vararg servers: ReconnectServer,
  ) {
    harness.session.disconnect()
    harness.sessionJob.cancelAndJoin()
    servers.forEach { it.shutdown() }
  }

  private fun connectResponseFrame(id: String): String = """{"type":"res","id":"$id","ok":true,"payload":{"snapshot":{"sessionDefaults":{"mainSessionKey":"main"}}}}"""

  private fun startGatewayServer(
    json: Json,
    onClosed: () -> Unit = {},
    onRequestFrame: (webSocket: WebSocket, id: String, method: String) -> Unit,
  ): ReconnectServer {
    val sockets = ConcurrentLinkedQueue<WebSocket>()
    val server =
      MockWebServer().apply {
        dispatcher =
          object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse =
              MockResponse().withWebSocketUpgrade(
                object : WebSocketListener() {
                  override fun onOpen(
                    webSocket: WebSocket,
                    response: Response,
                  ) {
                    sockets += webSocket
                    webSocket.send(LIFECYCLE_CONNECT_CHALLENGE_FRAME)
                  }

                  override fun onMessage(
                    webSocket: WebSocket,
                    text: String,
                  ) {
                    val frame = json.parseToJsonElement(text).jsonObject
                    if (frame["type"]?.jsonPrimitive?.content != "req") return
                    val id = frame["id"]?.jsonPrimitive?.content ?: return
                    val method = frame["method"]?.jsonPrimitive?.content ?: return
                    onRequestFrame(webSocket, id, method)
                  }

                  override fun onClosing(
                    webSocket: WebSocket,
                    code: Int,
                    reason: String,
                  ) {
                    onClosed()
                  }

                  override fun onClosed(
                    webSocket: WebSocket,
                    code: Int,
                    reason: String,
                  ) {
                    onClosed()
                  }
                },
              )
          }
        start()
      }
    return ReconnectServer(server = server, sockets = sockets)
  }
}
