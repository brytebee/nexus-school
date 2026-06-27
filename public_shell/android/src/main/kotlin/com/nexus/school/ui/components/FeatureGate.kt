package com.nexus.school.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import com.nexus.school.security.IdentityManager

/**
 * A wrapper composable that completely hides its content if the school's configured
 * license tier does NOT include the specified [moduleKey].
 * 
 * E.g. <FeatureGate moduleKey="attendance"> <AttendanceTab /> </FeatureGate>
 */
@Composable
fun FeatureGate(
    moduleKey: String,
    content: @Composable () -> Unit
) {
    val context = LocalContext.current
    val identityManager = IdentityManager(context)
    
    // Only compose the content if the license tier explicitly granted access
    if (identityManager.isModuleEnabled(moduleKey)) {
        content()
    }
}
