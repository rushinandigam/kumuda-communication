"""Google TTS service that uses synchronous streaming in a thread pool.

Works around a bug where the async ``TextToSpeechAsyncClient.streaming_synthesize``
hangs indefinitely with grpcio 1.82+ / google-cloud-texttospeech 2.37+.
The synchronous client's streaming works correctly, so we run it in an executor.
"""

import asyncio
import concurrent.futures
from collections.abc import AsyncGenerator

from loguru import logger

from pipecat.frames.frames import Frame, TTSAudioRawFrame
from pipecat.services.google.tts import GoogleTTSService

try:
    from google.api_core.client_options import ClientOptions
    from google.cloud import texttospeech_v1
    from google.oauth2 import service_account
except ImportError:
    pass

_executor = concurrent.futures.ThreadPoolExecutor(max_workers=4, thread_name_prefix="tts-sync")


class GoogleTTSSyncStreamingService(GoogleTTSService):
    """GoogleTTSService subclass that uses the sync streaming client.

    Identical to the parent except ``_stream_tts`` runs the synchronous
    ``TextToSpeechClient.streaming_synthesize`` in a thread-pool executor,
    yielding audio chunks back to the async pipeline as they arrive.
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._sync_client = self._create_sync_client()

    def _create_sync_client(self) -> "texttospeech_v1.TextToSpeechClient":
        creds = self._client._transport._credentials
        client_options = None
        if self._location:
            client_options = ClientOptions(
                api_endpoint=f"{self._location}-texttospeech.googleapis.com"
            )
        return texttospeech_v1.TextToSpeechClient(
            credentials=creds, client_options=client_options
        )

    async def _stream_tts(
        self,
        streaming_config: "texttospeech_v1.StreamingSynthesizeConfig",
        text: str,
        context_id: str,
        prompt: str | None = None,
    ) -> AsyncGenerator[Frame, None]:
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[bytes | None] = asyncio.Queue()

        def _run_sync_streaming():
            config_request = texttospeech_v1.StreamingSynthesizeRequest(
                streaming_config=streaming_config
            )

            def request_generator():
                yield config_request
                synthesis_input_params = {"text": text}
                if prompt is not None:
                    synthesis_input_params["prompt"] = prompt
                yield texttospeech_v1.StreamingSynthesizeRequest(
                    input=texttospeech_v1.StreamingSynthesisInput(**synthesis_input_params)
                )

            try:
                responses = self._sync_client.streaming_synthesize(request_generator())
                for response in responses:
                    chunk = response.audio_content
                    if chunk:
                        loop.call_soon_threadsafe(queue.put_nowait, chunk)
            except Exception as e:
                loop.call_soon_threadsafe(queue.put_nowait, e)
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, None)

        future = _executor.submit(_run_sync_streaming)

        await self.start_tts_usage_metrics(text)
        first_chunk = True
        CHUNK_SIZE = self.chunk_size
        audio_buffer = b""

        while True:
            item = await queue.get()
            if item is None:
                break
            if isinstance(item, Exception):
                raise item

            if first_chunk:
                await self.stop_ttfb_metrics()
                first_chunk = False

            audio_buffer += item
            while len(audio_buffer) >= CHUNK_SIZE:
                piece = audio_buffer[:CHUNK_SIZE]
                audio_buffer = audio_buffer[CHUNK_SIZE:]
                yield TTSAudioRawFrame(piece, self.sample_rate, 1, context_id=context_id)

        if audio_buffer:
            yield TTSAudioRawFrame(audio_buffer, self.sample_rate, 1, context_id=context_id)

        future.result()
