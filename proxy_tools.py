"""
proxy_tools - Proxy utilities for Python.
Provides module_property descriptor for module-level properties.
"""


class module_property:
    """Descriptor that allows defining properties at the module level.

    Usage:
        @module_property
        def my_prop():
            return compute_value()
    """

    def __init__(self, fget):
        self.fget = fget
        self.__doc__ = fget.__doc__
        self.__name__ = fget.__name__
        self.__module__ = fget.__module__

    def __get__(self, obj, objtype=None):
        return self.fget()

    def __set__(self, obj, value):
        raise AttributeError("can't set attribute")

    def __delete__(self, obj):
        raise AttributeError("can't delete attribute")
