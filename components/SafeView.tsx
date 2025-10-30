import { Colors } from "@/constants/theme";
import { JSX, ReactNode } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export const SafeView = ({ style, children, ...others }: { style?: StyleProp<ViewStyle>; children?: ReactNode; [key: string]: any }):JSX.Element => {
    return (
        <>
            <View style={styles.background}></View>
            <SafeAreaView style={style} {...others}>
                {children}
            </SafeAreaView>
        </>
    )
}
const styles = StyleSheet.create({
    background: {
        flex: 1,
        backgroundColor: Colors.dark.background,
        zIndex: -1,
        position: 'absolute',
        width: '100%',
        height: '100%'
    }
})