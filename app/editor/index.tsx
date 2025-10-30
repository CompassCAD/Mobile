import { ThemedText } from "@/components/themed-text";
import { Colors } from "@/constants/theme";
import { Link } from "expo-router";
import { useEffect, useRef } from "react";
import { GestureResponderEvent, StatusBar, StyleSheet, useWindowDimensions, View } from "react-native";
import Canvas, { CanvasRenderingContext2D } from "react-native-canvas";

const fixedCanvasHeight = StatusBar.currentHeight! + 20;

export default function Editor() {
    const canvas = useRef<Canvas>(null);
    const { width, height } = useWindowDimensions();
    const ctx = useRef<CanvasRenderingContext2D | null>(null);
    const test = () => {
        if (canvas.current) {
            canvas.current.width = width;
            canvas.current.height = height - fixedCanvasHeight;
            ctx.current = canvas.current.getContext('2d');
            ctx.current.fillStyle = 'purple';
            ctx.current.fillRect(0, 0, 100, 100);
        }
    }
    const handleTouch = (e: GestureResponderEvent) => {
        if (canvas.current) {
            if (ctx.current) {
                ctx.current.fillStyle = 'white';
                ctx.current.fillText('Touched!', e.nativeEvent.locationX, e.nativeEvent.locationY);
            }
        }
    }
    useEffect(() => {test()}, [])
    return (
        <>
            <View style={styles.topbar}>
                <ThemedText type='default'><Link href='/'>go back</Link></ThemedText>
            </View>
            <View style={styles.container} onTouchStart={handleTouch}>
                <Canvas ref={canvas} style={styles.canvas}/>
            </View>
        </>
    )
}

const styles = StyleSheet.create({
    topbar: {
        backgroundColor: Colors.dark.background,
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        paddingTop: StatusBar.currentHeight,
        height: fixedCanvasHeight + 40,
        zIndex: 3,
        display: 'flex',
        justifyContent: 'center',
        paddingHorizontal: 20,
        borderBottomColor: Colors.dark.border,
        borderBottomWidth: 0.75,
        boxShadow: '0px 0px 13px 3px rgba(0, 0, 0, 0.5)'
    },
    container: {
        flex: 1,
        backgroundColor: 'black',
        marginTop: fixedCanvasHeight
    },
    canvas: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0
    }
})
