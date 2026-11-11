package com.familygarden.app

import android.content.Context
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.StartOffset
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

object GardenSplash {
    @JvmStatic
    fun create(context: Context, onFinished: Runnable): ComposeView =
        ComposeView(context).apply { setContent { SplashScreen(onFinished) } }
}

@Composable
private fun SplashScreen(onFinished: Runnable) {
    val scope = rememberCoroutineScope()
    val entrance = remember { Animatable(1f) }
    val tapScale = remember { Animatable(1f) }

    LaunchedEffect(Unit) {
        entrance.animateTo(0f, spring(Spring.DampingRatioHighBouncy, Spring.StiffnessLow))
        delay(2500)
        onFinished.run()
    }

    val loop = rememberInfiniteTransition(label = "splash motion")
    val wobble by loop.animateFloat(
        initialValue = -6f,
        targetValue = 6f,
        animationSpec = infiniteRepeatable(tween(600, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "wobble"
    )
    val breath by loop.animateFloat(
        initialValue = 1f,
        targetValue = 1.08f,
        animationSpec = infiniteRepeatable(tween(900, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "breath"
    )

    BoxWithConstraints(
        modifier = Modifier.fillMaxSize()
            .background(Brush.verticalGradient(listOf(Color(0xFFFFF3B0), Color(0xFFFFC8DD), Color(0xFFBDE0FE))))
            .pointerInput(Unit) {
                detectTapGestures {
                    scope.launch {
                        tapScale.snapTo(0.75f)
                        tapScale.animateTo(1f, spring(Spring.DampingRatioHighBouncy, Spring.StiffnessMedium))
                    }
                }
            },
        contentAlignment = Alignment.Center
    ) {
        Balloon(0.12f, Color(0xFFFF6B6B), 7000, 0, 56.dp)
        Balloon(0.30f, Color(0xFF4D96FF), 9000, 1500, 44.dp)
        Balloon(0.50f, Color(0xFFFFD93D), 8000, 3000, 60.dp)
        Balloon(0.70f, Color(0xFF6BCB77), 10000, 800, 48.dp)
        Balloon(0.88f, Color(0xFFB388EB), 7500, 2200, 52.dp)

        val travel = maxHeight
        val portraitSize = minOf(150.dp, (maxWidth - 48.dp) / 2)
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Row(
                modifier = Modifier.graphicsLayer {
                    translationY = travel.toPx() * entrance.value
                    rotationZ = wobble
                    scaleX = breath * tapScale.value
                    scaleY = scaleX
                },
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                NameBadge("현진", Color(0xFF225C46), portraitSize)
                NameBadge("현서", Color(0xFF704786), portraitSize)
            }
            BasicText(stringResource(R.string.app_name), style = TextStyle(color = Color(0xFF233248), fontSize = 36.sp, fontWeight = FontWeight.Bold))
            BasicText("정원을 준비하고 있어요…", style = TextStyle(color = Color(0xFF233248), fontSize = 16.sp))
        }
    }
}

@Composable
private fun NameBadge(name: String, color: Color, size: Dp) {
    Box(Modifier.size(size).background(color, CircleShape), contentAlignment = Alignment.Center) {
        BasicText(name, style = TextStyle(color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.Bold))
    }
}

@Composable
private fun Balloon(xFraction: Float, color: Color, durationMs: Int, startDelayMs: Int, size: Dp) {
    val loop = rememberInfiniteTransition(label = "balloon")
    val progress by loop.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMs, easing = LinearEasing),
            initialStartOffset = StartOffset(startDelayMs)
        ),
        label = "rise"
    )
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val totalHeight = size * 1.6f
        Canvas(
            Modifier.size(width = size, height = totalHeight).offset(
                x = maxWidth * xFraction - size / 2,
                y = maxHeight - (maxHeight + totalHeight) * progress
            )
        ) {
            val bodyHeight = this.size.width * 1.25f
            drawLine(
                color = Color.Gray,
                start = Offset(this.size.width / 2, bodyHeight),
                end = Offset(this.size.width / 2, this.size.height),
                strokeWidth = 3f
            )
            drawOval(color = color, size = Size(this.size.width, bodyHeight))
        }
    }
}
